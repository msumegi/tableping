import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Card, MatchSource, Presence, Settings, Tab, TradeMatch } from "./types";
import { AddCardSheet } from "./AddCardSheet";
import { ProfilePhotoSheet } from "./ProfilePhotoSheet";
import {
  loadHave,
  loadSeenMatchIds,
  loadSettings,
  loadWant,
  removeCard,
  saveHave,
  saveSeenMatchIds,
  saveSettings,
  saveWant,
  upsertCard,
} from "./lib/storage";
import {
  CHECKIN_CTA,
  checkInHint,
  HAVE_FIRST_RUN_BODY,
  HAVE_FIRST_RUN_PRIVACY,
  HAVE_FIRST_RUN_TITLE,
  HAVE_LEDE,
  INSTALL_ANDROID,
  INSTALL_HEADING,
  INSTALL_IPHONE,
  INSTALL_NO_ACCOUNT,
  LEAVE_SHOP,
  locationHintCopy,
  NEARBY_LEDE,
  PING_HERE,
  PRIVACY_FAN,
  PRIVACY_LISTS,
  PRIVACY_PING,
  QR_SHEET_LEDE,
  tableShareHint,
  WANT_LEDE,
  YOU_LEDE,
  YOU_PHOTO_HINT,
  YOU_WHAT,
} from "./lib/copy";
import { complementaryDemoPresence, seedListsIfEmpty } from "./lib/demo";
import { presenceMatchSource } from "./lib/checkin";
import { pageJoinUrl, readJoinCodeFromUrl, stripJoinParams } from "./lib/join";
import { kindLabel, matchAgainst, sourceLabel } from "./lib/match";
import { compressProfilePhoto, initialsFromName } from "./lib/photo";
import { connectLocalHub, connectPresenceHub, HEARTBEAT_MS, PRESENCE_TTL_MS } from "./lib/presence";
import { decodeTableQr, tableJoinToQrDataUrl } from "./lib/qr";
import {
  formatShopDistance,
  rankShops,
  resolveShopInput,
  shopById,
  type Shop,
} from "./lib/shops";
import { normalizeTableCode } from "./lib/tableCode";

const TABS: { id: Tab; ico: string; lbl: string }[] = [
  { id: "have", ico: "▣", lbl: "Have" },
  { id: "want", ico: "☆", lbl: "Want" },
  { id: "nearby", ico: "◎", lbl: "Nearby" },
  { id: "you", ico: "●", lbl: "You" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("have");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [have, setHave] = useState<Card[]>(() => loadHave());
  const [want, setWant] = useState<Card[]>(() => loadWant());
  const [addingFor, setAddingFor] = useState<"have" | "want" | null>(null);
  const [live, setLive] = useState(false);
  const [checkedIn, setCheckedIn] = useState<Shop | null>(null);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [hintStatus, setHintStatus] = useState("");
  const [tableOn, setTableOn] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [brokerStatus, setBrokerStatus] = useState<"idle" | "live" | "error">("idle");
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [activePing, setActivePing] = useState<TradeMatch | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [seedNote, setSeedNote] = useState("");

  const haveRef = useRef(have);
  const wantRef = useRef(want);
  const settingsRef = useRef(settings);
  const checkedInRef = useRef(checkedIn);
  const tableOnRef = useRef(tableOn);
  const seenRef = useRef<Set<string>>(new Set(loadSeenMatchIds()));

  haveRef.current = have;
  wantRef.current = want;
  settingsRef.current = settings;
  checkedInRef.current = checkedIn;
  tableOnRef.current = tableOn;

  useEffect(() => saveHave(have), [have]);
  useEffect(() => saveWant(want), [want]);
  useEffect(() => saveSettings(settings), [settings]);

  function remember(next: Settings) {
    setSettings(next);
  }

  function checkIn(shop: Shop) {
    setCheckedIn(shop);
    remember({ ...settingsRef.current, lastShopId: shop.id });
    setLive(true);
    setTab("nearby");
  }

  function leaveShop() {
    setCheckedIn(null);
    if (!tableOnRef.current) setLive(false);
  }

  useEffect(() => {
    const code = readJoinCodeFromUrl(window.location.href);
    if (!code) return;
    remember({ ...settingsRef.current, tableCode: code });
    setTableOn(true);
    setLive(true);
    setTab("nearby");
    window.history.replaceState({}, "", stripJoinParams(window.location.href));
  }, []);

  function addCard(list: "have" | "want", card: Card, keepSheet = false) {
    if (list === "have") setHave((prev) => upsertCard(prev, card));
    else setWant((prev) => upsertCard(prev, card));
    if (!keepSheet) setAddingFor(null);
    setTab(list);
  }

  function ingestPeer(peer: Presence, source: MatchSource, force = false) {
    if (peer.ts === 0) return;
    if (!force && source === "gps") return;
    const match = matchAgainst(
      { userId: settingsRef.current.userId, have: haveRef.current, want: wantRef.current },
      peer,
      source,
    );
    if (!match) return;
    if (!force && seenRef.current.has(match.id)) return;
    seenRef.current.add(match.id);
    saveSeenMatchIds([...seenRef.current]);
    setMatches((prev) => [match, ...prev.filter((m) => m.id !== match.id)].slice(0, 20));
    setActivePing(match);
    vibratePing();
  }

  function fireDemo() {
    const seeded = seedListsIfEmpty(haveRef.current, wantRef.current);
    if (seeded.seeded) {
      setHave(seeded.have);
      setWant(seeded.want);
      haveRef.current = seeded.have;
      wantRef.current = seeded.want;
      setSeedNote("Added Pikachu to Have and Charizard to Want.");
    } else {
      setSeedNote("");
    }
    remember({ ...settingsRef.current, demoMode: true });
    const shop = checkedInRef.current;
    const demo = complementaryDemoPresence(haveRef.current, wantRef.current, {
      room: tableOn ? settingsRef.current.tableCode : "DEMO",
      shopId: shop?.id,
      shopName: shop?.name,
    });
    ingestPeer(demo, "demo", true);
    setTab("nearby");
  }

  useEffect(() => {
    if (!live) return;
    const classify = (p: Presence) =>
      presenceMatchSource(p, {
        shopId: checkedInRef.current?.id,
        tableOn: tableOnRef.current,
        tableCode: settingsRef.current.tableCode,
      });
    const local = connectLocalHub((p) => {
      const source = classify(p);
      if (source) ingestPeer(p, source);
    });
    let remote: Awaited<ReturnType<typeof connectPresenceHub>> | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const hub = await connectPresenceHub((p) => {
          const source = classify(p);
          if (source) ingestPeer(p, source);
        });
        if (cancelled) {
          hub.disconnect();
          return;
        }
        remote = hub;
        setBrokerStatus("live");
      } catch {
        if (!cancelled) setBrokerStatus("error");
      }
    })();

    const beat = () => {
      const shop = checkedInRef.current;
      const presence: Presence = {
        userId: settingsRef.current.userId,
        name: settingsRef.current.displayName,
        photo: settingsRef.current.photo,
        have: haveRef.current,
        want: wantRef.current,
        shopId: shop?.id,
        shopName: shop?.name,
        room: tableOnRef.current ? settingsRef.current.tableCode : undefined,
        ts: Date.now(),
      };
      local.publish(presence);
      remote?.publish(presence);
    };

    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      remote?.leave(settingsRef.current.userId, {
        shopId: checkedInRef.current?.id,
        room: tableOnRef.current ? settingsRef.current.tableCode : undefined,
      });
      remote?.disconnect();
      local.disconnect();
    };
  }, [live, checkedIn?.id, tableOn, settings.tableCode, settings.userId, settings.displayName, settings.photo]);

  function requestShopHint() {
    if (!navigator.geolocation) {
      setHintStatus("This phone can’t hint a shop.");
      return;
    }
    setHintStatus("Looking for a shop…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setHintStatus("");
      },
      (err) => {
        setHintStatus(err.message || "Location permission denied.");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    );
  }

  const livePeersNote = useMemo(() => {
    const fresh = matches.filter((m) => Date.now() - m.at < PRESENCE_TTL_MS * 2);
    return fresh.length;
  }, [matches]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1 className="brand" aria-label="TableTrade">
            Table<span>Trade</span>
          </h1>
          <p className="tag">Pokémon trades here, now — in this shop</p>
        </div>
        {activePing ? <span className="pill ok">Ping</span> : <span className="pill">{settings.displayName}</span>}
      </header>

      <main className="screen">
        {tab === "have" && (
          <ListPane
            title="Have list"
            lede={HAVE_LEDE}
            cards={have}
            empty="Nothing yet. Add a card you’d trade."
            intro={have.length === 0 ? <HaveFirstRun showInstall={!isStandalonePwa()} /> : null}
            onAdd={() => setAddingFor("have")}
            onRemove={(id) => setHave((prev) => removeCard(prev, id))}
          />
        )}
        {tab === "want" && (
          <ListPane
            title="Want list"
            lede={WANT_LEDE}
            cards={want}
            empty="Nothing yet. Add a card you want."
            onAdd={() => setAddingFor("want")}
            onRemove={(id) => setWant((prev) => removeCard(prev, id))}
          />
        )}
        {tab === "nearby" && (
          <NearbyPane
            settings={settings}
            live={live}
            checkedIn={checkedIn}
            here={here}
            hintStatus={hintStatus}
            tableOn={tableOn}
            joinCode={joinCode}
            brokerStatus={brokerStatus}
            matches={matches}
            liveCount={livePeersNote}
            seedNote={seedNote}
            onCheckIn={checkIn}
            onLeaveShop={leaveShop}
            onHint={requestShopHint}
            onTable={(on) => {
              setTableOn(on);
              if (on) setLive(true);
              else if (!checkedInRef.current) setLive(false);
            }}
            onJoinCode={setJoinCode}
            onJoin={() => {
              const code = normalizeTableCode(joinCode);
              if (code.length < 4) return;
              remember({ ...settings, tableCode: code });
              setTableOn(true);
              setLive(true);
            }}
            onDemo={fireDemo}
            onShowQr={() => setShowQr(true)}
            onScan={() => setShowScan(true)}
            onOpenPing={setActivePing}
          />
        )}
        {tab === "you" && (
          <YouPane
            settings={settings}
            installed={isStandalonePwa()}
            onName={(displayName) => remember({ ...settings, displayName })}
            onOpenPhoto={() => setShowPhoto(true)}
            onClearPhoto={() => remember({ ...settings, photo: undefined })}
            onDemoMode={(demoMode) => remember({ ...settings, demoMode })}
            onDemo={fireDemo}
          />
        )}
      </main>

      <nav className="nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            <span className="ico">{t.ico}</span>
            <span className="lbl">{t.lbl}</span>
          </button>
        ))}
      </nav>

      {addingFor && (
        <AddCardSheet
          target={addingFor}
          existingIds={new Set((addingFor === "have" ? have : want).map((c) => c.id))}
          onClose={() => setAddingFor(null)}
          onPick={(card) => addCard(addingFor, card)}
          onPickKeepOpen={(card) => addCard(addingFor, card, true)}
        />
      )}
      {activePing && <PingSheet match={activePing} onClose={() => setActivePing(null)} />}
      {showQr && settings.tableCode ? <QrSheet code={settings.tableCode} onClose={() => setShowQr(false)} /> : null}
      {showScan && (
        <ScanSheet
          onClose={() => setShowScan(false)}
          onPresence={(p) => {
            setShowScan(false);
            ingestPeer(p, "qr", true);
          }}
          onJoin={(code) => {
            setShowScan(false);
            remember({ ...settingsRef.current, tableCode: code });
            setTableOn(true);
            setLive(true);
          }}
        />
      )}
      {showPhoto ? (
        <ProfilePhotoSheet
          onClose={() => setShowPhoto(false)}
          onPhoto={async (file) => {
            try {
              const photo = await compressProfilePhoto(file);
              remember({ ...settingsRef.current, photo });
              setShowPhoto(false);
            } catch {
              /* keep the last photo */
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ListPane({
  title,
  lede,
  cards,
  empty,
  intro,
  onAdd,
  onRemove,
}: {
  title: string;
  lede: string;
  cards: Card[];
  empty: string;
  intro?: ReactNode;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="panel-title">{title}</h2>
      <p className="lede">{lede}</p>
      {intro}
      {cards.length === 0 ? (
        intro ? null : <div className="empty">{empty}</div>
      ) : (
        <div className="card-grid">
          {cards.map((card) => (
            <article className="card-tile" key={card.id}>
              <button className="x" aria-label={`Remove ${card.name}`} onClick={() => onRemove(card.id)}>
                ×
              </button>
              <img src={card.image} alt={card.name} />
              <figcaption>
                <div className="name">{card.name}</div>
                <div className="meta">
                  {card.setName} {card.number && `· ${card.number}`}
                </div>
              </figcaption>
            </article>
          ))}
        </div>
      )}
      <div className="fab-row">
        <button className="btn full" onClick={onAdd}>
          Add a Pokémon card
        </button>
      </div>
    </section>
  );
}

function NearbyPane({
  settings,
  live,
  checkedIn,
  here,
  hintStatus,
  tableOn,
  joinCode,
  brokerStatus,
  matches,
  liveCount,
  seedNote,
  onCheckIn,
  onLeaveShop,
  onHint,
  onTable,
  onJoinCode,
  onJoin,
  onDemo,
  onShowQr,
  onScan,
  onOpenPing,
}: {
  settings: Settings;
  live: boolean;
  checkedIn: Shop | null;
  here: { lat: number; lon: number } | null;
  hintStatus: string;
  tableOn: boolean;
  joinCode: string;
  brokerStatus: "idle" | "live" | "error";
  matches: TradeMatch[];
  liveCount: number;
  seedNote: string;
  onCheckIn: (shop: Shop) => void;
  onLeaveShop: () => void;
  onHint: () => void;
  onTable: (v: boolean) => void;
  onJoinCode: (v: string) => void;
  onJoin: () => void;
  onDemo: () => void;
  onShowQr: () => void;
  onScan: () => void;
  onOpenPing: (m: TradeMatch) => void;
}) {
  const [joinQr, setJoinQr] = useState("");
  const [shopQuery, setShopQuery] = useState("");
  const [namedShop, setNamedShop] = useState("");
  const tableCode = settings.tableCode;
  const shops = rankShops(here, shopQuery);
  const lastShop = shopById(settings.lastShopId);

  useEffect(() => {
    if (!tableCode) {
      setJoinQr("");
      return;
    }
    let cancelled = false;
    tableJoinToQrDataUrl(pageJoinUrl(tableCode, window.location))
      .then((url) => {
        if (!cancelled) setJoinQr(url);
      })
      .catch(() => {
        if (!cancelled) setJoinQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [tableCode]);

  return (
    <section>
      <div className="nearby-hero">
        <div className="radar" aria-hidden>
          <span className="dot" />
        </div>
        <h2>Trade here, now.</h2>
        <p className="lede" style={{ color: "rgba(243,234,216,0.78)" }}>
          {NEARBY_LEDE}
        </p>
      </div>

      <div className="you-card stack checkin-card">
        {checkedIn ? (
          <>
            <div className="toggle-row">
              <div>
                <strong>{checkedIn.name}</strong>
                <p className="hint">{checkedIn.city === "This shop" ? "You’re here." : checkedIn.city}</p>
              </div>
              <button className="btn secondary" onClick={onLeaveShop}>
                {LEAVE_SHOP}
              </button>
            </div>
            <p className="hint">{checkInHint(true, checkedIn.name)}</p>
            {!settings.photo ? <p className="hint">{YOU_PHOTO_HINT} Add one on You.</p> : null}
          </>
        ) : (
          <>
            <div>
              <strong>Check in</strong>
              <p className="hint">{checkInHint(false)}</p>
            </div>
            {shops.some((s) => s.hinted) ? (
              shops
                .filter((s) => s.hinted)
                .map((shop) => (
                  <ShopRow key={shop.id} shop={shop} primary onCheckIn={onCheckIn} />
                ))
            ) : lastShop && !shopQuery ? (
              <ShopRow shop={{ ...lastShop, hinted: false }} primary onCheckIn={onCheckIn} />
            ) : null}
            <p className="hint">{locationHintCopy()}</p>
            <button className="btn secondary full" onClick={onHint}>
              Hint the shop
            </button>
            {hintStatus ? <p className="hint">{hintStatus}</p> : null}
            <input
              className="field"
              placeholder="Search shops"
              aria-label="Search shops"
              value={shopQuery}
              onChange={(e) => setShopQuery(e.target.value)}
            />
            <div className="shop-list">
              {shops
                .filter((s) => !s.hinted)
                .map((shop) => (
                  <ShopRow key={shop.id} shop={shop} onCheckIn={onCheckIn} />
                ))}
            </div>
            <div>
              <div className="row">
                <input
                  className="field"
                  placeholder="This shop’s name"
                  aria-label="This shop’s name"
                  value={namedShop}
                  onChange={(e) => setNamedShop(e.target.value)}
                />
                <button
                  className="btn felt"
                  onClick={() => {
                    const shop = resolveShopInput(namedShop);
                    if (shop) onCheckIn(shop);
                  }}
                >
                  {CHECKIN_CTA}
                </button>
              </div>
              <p className="hint">Same name, same shop. That is the check-in.</p>
            </div>
          </>
        )}
      </div>

      <button className="btn ember full demo-after-checkin" onClick={onDemo}>
        See a demo ping now
      </button>
      {seedNote ? <p className="hint">{seedNote}</p> : null}

      <h3 className="panel-title" style={{ marginTop: 18 }}>
        Pings
      </h3>
      {matches.length === 0 ? (
        <div className="empty">No pings yet. Try a demo if you’re alone.</div>
      ) : (
        <div className="match-list">
          {matches.map((m) => (
            <button key={m.id + m.at} className="match-card" onClick={() => onOpenPing(m)}>
              <header>
                <span className="match-who">
                  <Face name={m.peer.name} photo={m.peer.photo} />
                  <strong>{m.peer.name}</strong>
                </span>
                <span className="badge">{sourceLabel(m.source)}</span>
              </header>
              <div className="hint">{kindLabel(m.kind)}</div>
            </button>
          ))}
        </div>
      )}

      <details className="optional-table">
        <summary>Table code</summary>
        <p className="hint">{tableShareHint(tableOn)}</p>
        <div className="toggle-row">
          <div>
            <strong>This table</strong>
            <p className="hint">A side path. Check-in is the room.</p>
          </div>
          <button className={tableOn ? "btn" : "btn secondary"} onClick={() => onTable(!tableOn)}>
            {tableOn ? "On" : "Off"}
          </button>
        </div>
        {tableCode ? (
          <p className="code" aria-label={`Table code ${tableCode.split("").join(" ")}`}>
            {tableCode}
          </p>
        ) : null}
        {joinQr ? (
          <button className="qr-box qr-tap" type="button" onClick={onShowQr} aria-label="Enlarge table QR">
            <img src={joinQr} alt={`QR to join table ${tableCode}`} />
          </button>
        ) : tableCode ? (
          <p className="hint">Drawing QR…</p>
        ) : null}
        <div>
          <div className="row">
            <input
              className="field"
              placeholder="Type their table code"
              aria-label="Type their table code"
              value={joinCode}
              onChange={(e) => onJoinCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
            />
            <button className="btn felt" onClick={onJoin}>
              Join
            </button>
          </div>
        </div>
        <button className="btn secondary full" onClick={onScan}>
          Scan their QR
        </button>
      </details>

      <details className="advanced">
        <summary>Advanced</summary>
        <p className="hint">
          Live: {live ? "yes" : "no"} · Broker: {brokerStatus}
          {liveCount ? ` · ${liveCount} recent ping${liveCount === 1 ? "" : "s"}` : ""}
        </p>
      </details>
    </section>
  );
}

function ShopRow({
  shop,
  primary,
  onCheckIn,
}: {
  shop: Shop & { distanceM?: number; hinted?: boolean };
  primary?: boolean;
  onCheckIn: (shop: Shop) => void;
}) {
  const distance = formatShopDistance(shop.distanceM);
  return (
    <div className={`shop-row${shop.hinted ? " hinted" : ""}${primary ? " primary" : ""}`}>
      <div>
        <strong>{shop.name}</strong>
        <p className="hint">
          {shop.city}
          {distance ? ` · ${distance}` : ""}
          {shop.hinted ? " · Here?" : ""}
        </p>
      </div>
      <button className={primary || shop.hinted ? "btn ember" : "btn felt"} onClick={() => onCheckIn(shop)}>
        {CHECKIN_CTA}
      </button>
    </div>
  );
}

function YouPane({
  settings,
  installed,
  onName,
  onOpenPhoto,
  onClearPhoto,
  onDemoMode,
  onDemo,
}: {
  settings: Settings;
  installed: boolean;
  onName: (name: string) => void;
  onOpenPhoto: () => void;
  onClearPhoto: () => void;
  onDemoMode: (on: boolean) => void;
  onDemo: () => void;
}) {
  return (
    <section>
      <h2 className="panel-title">You</h2>
      <p className="lede">{YOU_LEDE}</p>
      <div className="you-card stack">
        <label className="hint" htmlFor="name">
          Display name
        </label>
        <input
          id="name"
          className="field"
          maxLength={24}
          value={settings.displayName}
          onChange={(e) => onName(e.target.value)}
        />
        <div className="photo-row">
          <Face name={settings.displayName} photo={settings.photo} large />
          <div className="stack" style={{ flex: 1 }}>
            <button className="btn secondary full" onClick={onOpenPhoto}>
              {settings.photo ? "Change photo" : "Add a photo"}
            </button>
            {settings.photo ? (
              <button className="btn secondary" onClick={onClearPhoto}>
                Remove
              </button>
            ) : null}
            <p className="hint">{YOU_PHOTO_HINT}</p>
          </div>
        </div>
        <div className="toggle-row">
          <div>
            <strong>Demo mode</strong>
            <div className="hint">A ping without a second phone.</div>
          </div>
          <button className={settings.demoMode ? "btn" : "btn secondary"} onClick={() => onDemoMode(!settings.demoMode)}>
            {settings.demoMode ? "On" : "Off"}
          </button>
        </div>
        <button className="btn ember" onClick={onDemo}>
          See a demo ping now
        </button>
      </div>
      <h3 className="panel-title">What this is</h3>
      <p className="lede">{YOU_WHAT}</p>
      <ul className="privacy-lines">
        <li>{PRIVACY_LISTS}</li>
        <li>{PRIVACY_PING}</li>
        <li>{PRIVACY_FAN}</li>
      </ul>
      <h3 className="panel-title">{INSTALL_HEADING}</h3>
      {installed ? (
        <p className="lede">On your home screen. {INSTALL_NO_ACCOUNT}</p>
      ) : (
        <div className="you-card stack">
          <p className="hint">{INSTALL_NO_ACCOUNT}</p>
          <p className="lede" style={{ margin: 0 }}>
            {INSTALL_IPHONE}
          </p>
          <p className="lede" style={{ margin: 0 }}>
            {INSTALL_ANDROID}
          </p>
        </div>
      )}
    </section>
  );
}

function PingSheet({ match, onClose }: { match: TradeMatch; onClose: () => void }) {
  const give = match.youCanGive[0];
  const get = match.youCanGet[0];
  const place = match.peer.shopName;
  return (
    <div className="ping-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <Face name={match.peer.name} photo={match.peer.photo} large />
        <div className="ping-kicker">{match.source === "demo" ? "Demo ping" : "Here, now"}</div>
        <h2 className="ping-title">
          {match.peer.name} {PING_HERE}
        </h2>
        {place ? <p className="hint">{place}</p> : null}
        <p className="lede">{kindLabel(match.kind)}</p>
        <div className="match-pair">
          <div>
            {give ? <img src={give.image} alt={give.name} /> : <div className="empty">—</div>}
            <div className="hint">You can give</div>
            <strong>{give?.name ?? "—"}</strong>
          </div>
          <div className="swap">⇄</div>
          <div>
            {get ? <img src={get.image} alt={get.name} /> : <div className="empty">—</div>}
            <div className="hint">You can get</div>
            <strong>{get?.name ?? "—"}</strong>
          </div>
        </div>
        {match.youCanGive.length + match.youCanGet.length > 2 ? (
          <p className="hint">
            Plus {Math.max(0, match.youCanGive.length - 1) + Math.max(0, match.youCanGet.length - 1)} more cards that
            match.
          </p>
        ) : null}
        <p className="hint">You’re here. Go talk.</p>
        <div className="sheet-actions">
          <button className="btn ember full" onClick={onClose}>
            Go talk
          </button>
        </div>
      </div>
    </div>
  );
}

function Face({ name, photo, large }: { name: string; photo?: string; large?: boolean }) {
  const cls = large ? "avatar lg" : "avatar";
  if (photo) return <img className={cls} src={photo} alt={name} />;
  return (
    <span className={`${cls} fallback`} aria-hidden>
      {initialsFromName(name)}
    </span>
  );
}

function QrSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    tableJoinToQrDataUrl(pageJoinUrl(code, window.location))
      .then(setUrl)
      .catch(() => setErr("Could not draw a QR code."));
  }, [code]);
  return (
    <div className="qr-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 className="panel-title">This table</h2>
        <p className="code">{code}</p>
        <p className="lede">{QR_SHEET_LEDE}</p>
        <div className="qr-box">{url ? <img src={url} alt={`QR to join table ${code}`} /> : <p className="hint">Drawing…</p>}</div>
        {err ? <p className="status error">{err}</p> : null}
        <div className="sheet-actions">
          <button className="btn secondary full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ScanSheet({
  onClose,
  onPresence,
  onJoin,
}: {
  onClose: () => void;
  onPresence: (p: Presence) => void;
  onJoin: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("Point at their QR.");
  const streamRef = useRef<MediaStream | null>(null);
  const timer = useRef(0);
  const onPresenceRef = useRef(onPresence);
  const onJoinRef = useRef(onJoin);
  onPresenceRef.current = onPresence;
  onJoinRef.current = onJoin;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (typeof BarcodeDetector === "undefined") {
          setErr("This browser can’t scan QR. Use Chrome on Android, or type their table code.");
          return;
        }
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const code of codes) {
              const decoded = decodeTableQr(code.rawValue);
              if (decoded?.kind === "presence") {
                onPresenceRef.current(decoded.presence);
                return;
              }
              if (decoded?.kind === "join") {
                onJoinRef.current(decoded.code);
                return;
              }
            }
          } catch {
            /* keep scanning */
          }
          timer.current = window.setTimeout(() => void tick(), 350);
        };
        void tick();
      } catch {
        setErr("Camera permission denied. You can still join with a table code.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="qr-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 className="panel-title">Scan their QR</h2>
        <div className="video-wrap">
          <video ref={videoRef} playsInline muted />
        </div>
        <p className="hint">{err}</p>
        <div className="sheet-actions">
          <button className="btn secondary full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function HaveFirstRun({ showInstall }: { showInstall: boolean }) {
  return (
    <div className="first-run">
      <h3>{HAVE_FIRST_RUN_TITLE}</h3>
      <p>{HAVE_FIRST_RUN_BODY}</p>
      <p className="hint">{HAVE_FIRST_RUN_PRIVACY}</p>
      {showInstall ? (
        <p className="install-quiet">
          <strong>{INSTALL_HEADING}.</strong> {INSTALL_NO_ACCOUNT} {INSTALL_IPHONE} {INSTALL_ANDROID}
        </p>
      ) : null}
    </div>
  );
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function vibratePing() {
  try {
    navigator.vibrate?.([40, 60, 80]);
  } catch {
    /* ignore */
  }
}
