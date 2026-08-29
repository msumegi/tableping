import { useEffect, useMemo, useRef, useState } from "react";
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
import { complementaryDemoPresence, seedListsIfEmpty } from "./lib/demo";
import { encodeGeohash, haversineMeters, MAX_MATCH_METERS } from "./lib/geo";
import { kindLabel, matchAgainst } from "./lib/match";
import { connectLocalHub, connectPresenceHub, HEARTBEAT_MS, PRESENCE_TTL_MS } from "./lib/presence";
import { decodePresenceQr, presenceToQrDataUrl } from "./lib/qr";
import { normalizeTableCode, randomTableCode } from "./lib/tableCode";

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
      setSeedNote("Demo added Base Set Pikachu to Have and Charizard to Want.");
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
      setGeoStatus("This phone has no geolocation.");
      return;
    }
    setGeoStatus("Finding the shop…");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        locationRef.current = { lat, lon, geohash: encodeGeohash(lat, lon) };
        setGeoStatus("In-room radar on (~120 m, not city-wide).");
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
          <h1 className="brand">
            Table<span>Ping</span>
          </h1>
          <p className="tag">Pokémon trades at the table — not across town</p>
        </div>
        {activePing ? <span className="pill ok">Ping</span> : <span className="pill">{settings.displayName}</span>}
      </header>

      <main className="screen">
        {tab === "have" && (
          <ListPane
            title="Have list"
            lede="Cards you can trade away at the shop."
            cards={have}
            empty="Nothing listed yet. Add a card you would actually trade."
            onAdd={() => setAddingFor("have")}
            onRemove={(id) => setHave((prev) => removeCard(prev, id))}
          />
        )}
        {tab === "want" && (
          <ListPane
            title="Want list"
            lede="Printings you’re hunting. Matches use the exact card, not just the Pokémon name."
            cards={want}
            empty="Empty hunt list. Search a card you still need."
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
            onGps={setGpsOn}
            onTable={(on) => {
              setTableOn(on);
              if (on) {
                const code = settings.tableCode || randomTableCode();
                remember({ ...settings, tableCode: code });
                setLive(true);
              }
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
      {showQr && (
        <QrSheet
          name={settings.displayName}
          have={have}
          want={want}
          userId={settings.userId}
          onClose={() => setShowQr(false)}
        />
      )}
      {showScan && (
        <ScanSheet
          onClose={() => setShowScan(false)}
          onPresence={(p) => {
            setShowScan(false);
            ingestPeer(p, "qr");
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
  onAdd,
  onRemove,
}: {
  title: string;
  lede: string;
  cards: Card[];
  empty: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="panel-title">{title}</h2>
      <p className="lede">{lede}</p>
      {cards.length === 0 ? (
        <div className="empty">{empty}</div>
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
  return (
    <section>
      <div className="nearby-hero">
        <div className="radar" aria-hidden>
          <span className="dot" />
        </div>
        <h2>Same room, not same city</h2>
        <p className="lede" style={{ color: "rgba(243,234,216,0.78)" }}>
          TablePing only looks about a shop away (~120 m) or at people who share your table
          code. It will not search a 25-mile radius.
        </p>
        <button className="btn ember full" onClick={onDemo}>
          Try a demo ping
        </button>
        {seedNote ? <p className="hint">{seedNote}</p> : null}
      </div>

      <div className="you-card stack">
        <div className="toggle-row">
          <div>
            <strong>I’m at the shop</strong>
            <div className="hint">{geoStatus}</div>
          </div>
          <button className={gpsOn ? "btn" : "btn secondary"} onClick={() => onGps(!gpsOn)}>
            {gpsOn ? "On" : "Off"}
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <strong>Share a table code</strong>
            <div className="hint">Indoor shops where GPS is fuzzy. Show this to the person across from you.</div>
          </div>
          <button className={tableOn ? "btn" : "btn secondary"} onClick={() => onTable(!tableOn)}>
            {tableOn ? "On" : "Off"}
          </button>
        </div>
        {tableOn && settings.tableCode ? <div className="code">{settings.tableCode}</div> : null}
        <div className="row">
          <input
            className="field"
            placeholder="Join table code"
            value={joinCode}
            onChange={(e) => onJoinCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
          <button className="btn felt" onClick={onJoin}>
            Join
          </button>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={onShowQr}>
            Show my QR
          </button>
          <button className="btn secondary" onClick={onScan}>
            Scan their QR
          </button>
        </div>
        <p className="hint">
          Live: {live ? "yes" : "no"} · Broker: {brokerStatus}
          {liveCount ? ` · ${liveCount} recent ping${liveCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <h3 className="panel-title" style={{ marginTop: 18 }}>
        Pings
      </h3>
      {matches.length === 0 ? (
        <div className="empty">No pings yet. Use demo mode if you’re testing alone.</div>
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
  onName,
  onDemoMode,
  onDemo,
}: {
  settings: Settings;
  onName: (name: string) => void;
  onDemoMode: (on: boolean) => void;
  onDemo: () => void;
}) {
  return (
    <section>
      <h2 className="panel-title">You</h2>
      <p className="lede">This stays on this phone. There is no account.</p>
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
            <div className="hint">Lets you see a match ping without a second real user.</div>
          </div>
          <button className={settings.demoMode ? "btn" : "btn secondary"} onClick={() => onDemoMode(!settings.demoMode)}>
            {settings.demoMode ? "On" : "Off"}
          </button>
        </div>
        <button className="btn ember" onClick={onDemo}>
          Fire a demo ping now
        </button>
      </div>
      <h3 className="panel-title">What v1 is</h3>
      <p className="lede">
        Pokémon TCG only. Have/want lists. Type a name or scan one card at a time. In-the-room pings
        when someone nearby has what you want, wants what you have, or both. No meetup scheduler. No
        Magic. No One Piece. No city-wide radius.
      </p>
      <h3 className="panel-title">Install on Android</h3>
      <p className="lede">
        Chrome menu → <strong>Add to Home screen</strong> / <strong>Install app</strong>. TablePing
        then opens like a phone app.
      </p>
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
        <div className="ping-kicker">{match.source === "demo" ? "Demo ping" : "Table ping"}</div>
        <h2 className="ping-title">{match.peer.name} is at your table</h2>
        <p className="lede">{kindLabel(match.kind)}</p>
        {match.distanceM != null ? (
          <p className="hint">About {Math.max(1, Math.round(match.distanceM))} m away</p>
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
            Plus {Math.max(0, match.youCanGive.length - 1) + Math.max(0, match.youCanGet.length - 1)} more overlapping
            printings.
          </p>
        ) : null}
        <p className="hint">You’re already in the same room — go talk. TablePing does not schedule meetups.</p>
        <div className="sheet-actions">
          <button className="btn ember full" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function QrSheet({
  name,
  have,
  want,
  userId,
  onClose,
}: {
  name: string;
  have: Card[];
  want: Card[];
  userId: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    presenceToQrDataUrl({ userId, name, have, want })
      .then(setUrl)
      .catch(() => setErr("Could not draw a QR code."));
  }, [userId, name, have, want]);
  return (
    <div className="qr-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 className="panel-title">Table QR</h2>
        <p className="lede">Someone at the same table scans this. No city-wide broadcast.</p>
        <div className="qr-box">{url ? <img src={url} alt="TablePing QR" /> : <p className="hint">Drawing…</p>}</div>
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
}: {
  onClose: () => void;
  onPresence: (p: Presence) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("Point the camera at their TablePing QR.");
  const streamRef = useRef<MediaStream | null>(null);
  const timer = useRef(0);
  const onPresenceRef = useRef(onPresence);
  onPresenceRef.current = onPresence;

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
          setErr("This browser can’t scan QR. Use Chrome on Android, or type their table code instead.");
          return;
        }
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const code of codes) {
              const presence = decodePresenceQr(code.rawValue);
              if (presence) {
                onPresenceRef.current(presence);
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
        <h2 className="panel-title">Scan table QR</h2>
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

function vibratePing() {
  try {
    navigator.vibrate?.([40, 60, 80]);
  } catch {
    /* ignore */
  }
}
