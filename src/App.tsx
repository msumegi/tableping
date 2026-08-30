import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Card, MatchSource, Presence, Settings, Tab, TradeMatch } from "./types";
import { AddCardSheet } from "./AddCardSheet";
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
  gpsOptionalHint,
  HAVE_FIRST_RUN_BODY,
  HAVE_FIRST_RUN_PRIVACY,
  HAVE_FIRST_RUN_TITLE,
  HAVE_LEDE,
  INSTALL_ANDROID,
  INSTALL_HEADING,
  INSTALL_IPHONE,
  INSTALL_NO_ACCOUNT,
  NEARBY_LEDE,
  PRIVACY_FAN,
  PRIVACY_LISTS,
  PRIVACY_PING,
  QR_SHEET_LEDE,
  shopHint,
  tableShareHint,
  WANT_LEDE,
  YOU_LEDE,
  YOU_WHAT,
} from "./lib/copy";
import { complementaryDemoPresence, seedListsIfEmpty } from "./lib/demo";
import { encodeGeohash, haversineMeters, MAX_MATCH_METERS } from "./lib/geo";
import { pageJoinUrl, readJoinCodeFromUrl, stripJoinParams } from "./lib/join";
import { kindLabel, matchAgainst } from "./lib/match";
import { connectLocalHub, connectPresenceHub, HEARTBEAT_MS, PRESENCE_TTL_MS } from "./lib/presence";
import { decodeTableQr, tableJoinToQrDataUrl } from "./lib/qr";
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
  const [gpsOn, setGpsOn] = useState(false);
  const [tableOn, setTableOn] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [geoStatus, setGeoStatus] = useState("Off");
  const [brokerStatus, setBrokerStatus] = useState<"idle" | "live" | "error">("idle");
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [activePing, setActivePing] = useState<TradeMatch | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [seedNote, setSeedNote] = useState("");

  const haveRef = useRef(have);
  const wantRef = useRef(want);
  const settingsRef = useRef(settings);
  const locationRef = useRef<{ lat: number; lon: number; geohash: string } | null>(null);
  const seenRef = useRef<Set<string>>(new Set(loadSeenMatchIds()));
  const watchId = useRef<number | null>(null);

  haveRef.current = have;
  wantRef.current = want;
  settingsRef.current = settings;

  useEffect(() => saveHave(have), [have]);
  useEffect(() => saveWant(want), [want]);
  useEffect(() => saveSettings(settings), [settings]);

  function remember(next: Settings) {
    setSettings(next);
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
    let distanceM: number | undefined;
    const loc = locationRef.current;
    if (source === "gps" && loc && peer.lat != null && peer.lon != null) {
      distanceM = haversineMeters(loc.lat, loc.lon, peer.lat, peer.lon);
      if (distanceM > MAX_MATCH_METERS) return;
    }
    const match = matchAgainst(
      { userId: settingsRef.current.userId, have: haveRef.current, want: wantRef.current },
      peer,
      source,
      distanceM,
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
    const loc = locationRef.current;
    const demo = complementaryDemoPresence(haveRef.current, wantRef.current, {
      geohash: loc?.geohash,
      lat: loc?.lat,
      lon: loc?.lon,
      room: tableOn ? settingsRef.current.tableCode : "DEMO",
    });
    ingestPeer(demo, "demo", true);
    setTab("nearby");
  }

  useEffect(() => {
    if (!live) return;
    const local = connectLocalHub((p) => ingestPeer(p, p.room ? "table" : "gps"));
    let remote: Awaited<ReturnType<typeof connectPresenceHub>> | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const hub = await connectPresenceHub((p) => {
          const source: MatchSource =
            p.room && tableOn && p.room === settingsRef.current.tableCode ? "table" : "gps";
          ingestPeer(p, source);
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
      const loc = locationRef.current;
      const presence: Presence = {
        userId: settingsRef.current.userId,
        name: settingsRef.current.displayName,
        have: haveRef.current,
        want: wantRef.current,
        geohash: gpsOn ? loc?.geohash : undefined,
        lat: gpsOn ? loc?.lat : undefined,
        lon: gpsOn ? loc?.lon : undefined,
        room: tableOn ? settingsRef.current.tableCode : undefined,
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
      remote?.leave(settingsRef.current.userId, locationRef.current?.geohash, settingsRef.current.tableCode);
      remote?.disconnect();
      local.disconnect();
    };
  }, [live, gpsOn, tableOn, settings.tableCode, settings.userId, settings.displayName]);

  useEffect(() => {
    if (!gpsOn) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      return;
    }
    if (!navigator.geolocation) {
      setGeoStatus("This phone can’t share location.");
      return;
    }
    setGeoStatus("Looking around this shop…");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        locationRef.current = { lat, lon, geohash: encodeGeohash(lat, lon) };
        setGeoStatus("Ready to trade here.");
        setLive(true);
      },
      (err) => {
        setGeoStatus(err.message || "Location permission denied.");
        setGpsOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 8_000, timeout: 12_000 },
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [gpsOn]);

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
          <p className="tag">Pokémon trades here, now — at this table</p>
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
            intro={
              have.length === 0 ? <HaveFirstRun showInstall={!isStandalonePwa()} /> : null
            }
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
            gpsOn={gpsOn}
            tableOn={tableOn}
            joinCode={joinCode}
            geoStatus={geoStatus}
            brokerStatus={brokerStatus}
            matches={matches}
            liveCount={livePeersNote}
            seedNote={seedNote}
            onGps={(on) => {
              if (!on) setGeoStatus("Off");
              setGpsOn(on);
            }}
            onTable={(on) => {
              setTableOn(on);
              if (on) setLive(true);
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
      {activePing && (
        <PingSheet match={activePing} onClose={() => setActivePing(null)} />
      )}
      {showQr && settings.tableCode ? (
        <QrSheet code={settings.tableCode} onClose={() => setShowQr(false)} />
      ) : null}
      {showScan && (
        <ScanSheet
          onClose={() => setShowScan(false)}
          onPresence={(p) => {
            setShowScan(false);
            ingestPeer(p, "qr");
          }}
          onJoin={(code) => {
            setShowScan(false);
            remember({ ...settingsRef.current, tableCode: code });
            setTableOn(true);
            setLive(true);
          }}
        />
      )}
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
  gpsOn,
  tableOn,
  joinCode,
  geoStatus,
  brokerStatus,
  matches,
  liveCount,
  seedNote,
  onGps,
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
  gpsOn: boolean;
  tableOn: boolean;
  joinCode: string;
  geoStatus: string;
  brokerStatus: "idle" | "live" | "error";
  matches: TradeMatch[];
  liveCount: number;
  seedNote: string;
  onGps: (v: boolean) => void;
  onTable: (v: boolean) => void;
  onJoinCode: (v: string) => void;
  onJoin: () => void;
  onDemo: () => void;
  onShowQr: () => void;
  onScan: () => void;
  onOpenPing: (m: TradeMatch) => void;
}) {
  const [joinQr, setJoinQr] = useState("");
  const tableCode = settings.tableCode;

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
        <button className="btn ember full" onClick={onDemo}>
          See a demo ping now
        </button>
        {seedNote ? <p className="hint">{seedNote}</p> : null}
      </div>

      <div className="you-card stack table-share">
        <div className="toggle-row">
          <div>
            <strong>This table</strong>
            <p className="hint">{tableShareHint(tableOn)}</p>
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
          <p className="hint">The other types it or scans. That is the join.</p>
        </div>
        <button className="btn secondary full" onClick={onScan}>
          Scan their QR
        </button>
        <details className="optional-gps">
          <summary>I’m at the shop (optional)</summary>
          <p className="hint">{gpsOptionalHint()}</p>
          <div className="toggle-row">
            <p className="hint">{shopHint(gpsOn, geoStatus)}</p>
            <button className={gpsOn ? "btn" : "btn secondary"} onClick={() => onGps(!gpsOn)}>
              {gpsOn ? "On" : "Off"}
            </button>
          </div>
        </details>
        <details className="advanced">
          <summary>Advanced</summary>
          <p className="hint">
            Live: {live ? "yes" : "no"} · Broker: {brokerStatus}
            {liveCount ? ` · ${liveCount} recent ping${liveCount === 1 ? "" : "s"}` : ""}
          </p>
        </details>
      </div>

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
                <strong>{m.peer.name}</strong>
                <span className="badge">{m.source}</span>
              </header>
              <div className="hint">{kindLabel(m.kind)}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function YouPane({
  settings,
  installed,
  onName,
  onDemoMode,
  onDemo,
}: {
  settings: Settings;
  installed: boolean;
  onName: (name: string) => void;
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
  return (
    <div className="ping-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="radar" aria-hidden>
          <span className="dot" />
        </div>
        <div className="ping-kicker">{match.source === "demo" ? "Demo ping" : "Here, now"}</div>
        <h2 className="ping-title">{match.peer.name} is at your table</h2>
        <p className="lede">{kindLabel(match.kind)}</p>
        {match.distanceM != null ? (
          <p className="hint">About {Math.max(1, Math.round(match.distanceM))} m from here</p>
        ) : null}
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
