import { useEffect, useRef, useState, type ReactNode } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
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
  HERE_NOTE_HINT,
  HERE_NOTE_PLACEHOLDER,
  HERE_NOTE_LABEL,
  HERE_NOTE_MAX,
  LOCATION_ASK,
  PERMISSION_LOCATION,
  PERMISSION_NEARBY,
  OPEN_APP_SETTINGS,
  INSTALL_ANDROID,
  INSTALL_HEADING,
  INSTALL_IPHONE,
  INSTALL_NO_ACCOUNT,
  LEAVE_LOOKING,
  locationHintCopy,
  NEARBY_LEDE,
  PING_HERE,
  PRIVACY_FAN,
  PRIVACY_LISTS,
  PRIVACY_PING,
  SITE_APP_PAGE,
  SITE_HOME,
  SITE_PRIVACY,
  HELP_MAIL,
  COMPANY,
  BUILT_BY,
  WANT_LEDE,
  YOU_LEDE,
  YOU_PHOTO_HINT,
  YOU_WHAT,
  AGE_TITLE,
  AGE_BODY,
  AGE_YES,
  AGE_NO,
  AGE_BLOCKED,
  RADIO_DOWN,
  LOCATION_OFF_HINT,
  OPEN_LOCATION_SETTINGS,
  BLUETOOTH_OFF_HINT,
  TURN_ON_BLUETOOTH,
  LISTS_TOO_BIG,
  OLDER_APP_HINT,
  HEAR_AGAIN,
  REPORT_PEER,
  MATCH_PRINTING,
} from "./lib/copy";
import { complementaryDemoPresence, seedListsIfEmpty } from "./lib/demo";
import { kindLabel, matchAgainst, sourceLabel } from "./lib/match";
import { compressProfilePhoto, initialsFromName } from "./lib/photo";
import { connectLocalHub } from "./lib/presence";
import {
  canUsePhoneNearby,
  nearbyBlockFromError,
  payloadTooLarge,
  openPhoneLocationSettings,
  openPhoneAppSettings,
  phonePermissionStatus,
  phoneRadioInfo,
  recheckPhoneRadio,
  requestPhoneBluetooth,
  startPhoneNearby,
  updatePhoneNearby,
  type NearbyBlock,
} from "./lib/bleNearby";
import { permissionDenied, resumePermission, showLocationAsk } from "./lib/nearbyPermission";

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
  const [looking, setLooking] = useState(false);
  const [hintStatus, setHintStatus] = useState("");
  const [radioBlock, setRadioBlock] = useState<NearbyBlock | null>(null);
  const [legacyHint, setLegacyHint] = useState("");
  const [needsLocation, setNeedsLocation] = useState(false);
  const needsLocationRef = useRef(false);
  needsLocationRef.current = needsLocation;
  const [brokerStatus] = useState<"idle" | "live" | "error">("idle");
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [activePing, setActivePing] = useState<TradeMatch | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [seedNote, setSeedNote] = useState("");

  const [ageBlocked, setAgeBlocked] = useState(false);

  const haveRef = useRef(have);
  const wantRef = useRef(want);
  const settingsRef = useRef(settings);
  const stopNearbyRef = useRef<null | (() => void)>(null);
  const pendingBlockRef = useRef<NearbyBlock | null>(null);
  const lookingRef = useRef(false);
  const startingRef = useRef(false);
  const startLookingRef = useRef<() => void>(() => {});
  const seenRef = useRef<Set<string>>(new Set(loadSeenMatchIds()));

  haveRef.current = have;
  wantRef.current = want;
  settingsRef.current = settings;

  useEffect(() => saveHave(have), [have]);
  useEffect(() => saveWant(want), [want]);
  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    if (!canUsePhoneNearby()) return;
    void phoneRadioInfo()
      .then((info) => setNeedsLocation(Boolean(info.needsLocation)))
      .catch(() => {});
  }, []);

  function currentPresence(): Presence {
    return {
      userId: settingsRef.current.userId,
      name: settingsRef.current.displayName,
      note: settingsRef.current.lookingNote?.trim() || undefined,
      have: haveRef.current,
      want: wantRef.current,
      ts: Date.now(),
    };
  }

  function remember(next: Settings) {
    setSettings(next);
  }

  async function startLooking() {
    if (lookingRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      if (canUsePhoneNearby()) {
        const already = await phonePermissionStatus().catch(() => null);
        if (already && already.granted === false && already.blocked) {
          const next = permissionDenied(
            { looking: false, hint: "", block: null, requests: 0 },
            { blocked: true, needsLocation: needsLocationRef.current },
          );
          setLooking(false);
          lookingRef.current = false;
          setLive(false);
          setHintStatus(next.hint);
          setRadioBlock("settings");
          pendingBlockRef.current = "settings";
          return;
        }
        setHintStatus("Turning looking on…");
        try {
          stopNearbyRef.current = await startPhoneNearby(
            currentPresence(),
            (peer) => ingestPeer(peer, "ble"),
            (code) => {
              if (code === "LEGACY_PEER") setLegacyHint(OLDER_APP_HINT);
              if (code === "PAYLOAD_TOO_LARGE") setHintStatus(LISTS_TOO_BIG);
              if (code === "LOCATION_OFF" || code === "BLUETOOTH_OFF") leaveLookingForRadio(code);
            },
          );
          pendingBlockRef.current = null;
          setRadioBlock(null);
          setLooking(true);
          lookingRef.current = true;
          setLive(true);
          setHintStatus("");
          setTab("nearby");
        } catch (err) {
          const block = nearbyBlockFromError(err);
          if (block === "permission" || block === "settings") {
            const next = permissionDenied(
              { looking: false, hint: "", block: null, requests: 1 },
              { blocked: block === "settings", needsLocation: needsLocationRef.current },
            );
            setLooking(false);
            lookingRef.current = false;
            setLive(false);
            setHintStatus(next.hint);
            setRadioBlock(next.block);
            pendingBlockRef.current = next.block;
          } else {
            showNearbyFailure(err);
          }
        }
        return;
      }
      if (import.meta.env.DEV) {
        pendingBlockRef.current = null;
        setRadioBlock(null);
        setLooking(true);
        lookingRef.current = true;
        setLive(true);
        setHintStatus("");
        setTab("nearby");
        return;
      }
      setHintStatus(RADIO_DOWN);
    } finally {
      startingRef.current = false;
    }
  }

  startLookingRef.current = () => {
    void startLooking();
  };

  useEffect(() => {
    let removed = false;
    let handle: { remove: () => Promise<void> | void } | undefined;
    void CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      if (lookingRef.current) {
        void recheckPhoneRadio().catch((err) => showNearbyFailure(err));
        return;
      }
      const waiting = pendingBlockRef.current;
      if (waiting === "permission" || waiting === "settings") {
        void phonePermissionStatus()
          .then((status) => {
            const next = resumePermission(
              {
                looking: false,
                hint: "",
                block: waiting,
                requests: 1,
              },
              Boolean(status.granted),
            );
            if (status.granted) {
              setHintStatus("");
              setRadioBlock(null);
              pendingBlockRef.current = null;
              setLooking(false);
              lookingRef.current = false;
              return;
            }
            setHintStatus(next.hint || (needsLocationRef.current ? PERMISSION_LOCATION : PERMISSION_NEARBY));
            setRadioBlock(status.blocked ? "settings" : "permission");
            pendingBlockRef.current = status.blocked ? "settings" : "permission";
            setLooking(false);
            lookingRef.current = false;
          })
          .catch(() => {});
        return;
      }
      if (waiting === "location" || waiting === "bluetooth") startLookingRef.current();
    }).then((sub) => {
      if (removed) void sub.remove();
      else handle = sub;
    }).catch(() => {});
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, []);

  async function openLocationSettings() {
    try {
      await openPhoneLocationSettings();
    } catch {
      setHintStatus(LOCATION_OFF_HINT);
      setRadioBlock("location");
      pendingBlockRef.current = "location";
    }
  }

  async function openAppSettings() {
    try {
      await openPhoneAppSettings();
    } catch {
      setHintStatus(needsLocation ? PERMISSION_LOCATION : PERMISSION_NEARBY);
      setRadioBlock("settings");
      pendingBlockRef.current = "settings";
    }
  }

  async function enableBluetooth() {
    try {
      await requestPhoneBluetooth();
      await startLooking();
    } catch {
      setHintStatus(BLUETOOTH_OFF_HINT);
      setRadioBlock("bluetooth");
      pendingBlockRef.current = "bluetooth";
    }
  }

  function showNearbyFailure(err: unknown) {
    const block = nearbyBlockFromError(err);
    if (block === "location" || block === "bluetooth" || block === "permission" || block === "settings") {
      stopNearbyRef.current?.();
      stopNearbyRef.current = null;
      setLooking(false);
      lookingRef.current = false;
      setLive(false);
    }
    pendingBlockRef.current = block;
    setRadioBlock(block);
    if (block === "location") setHintStatus(LOCATION_OFF_HINT);
    else if (block === "bluetooth") setHintStatus(BLUETOOTH_OFF_HINT);
    else if (block === "settings" || block === "permission") {
      const next = permissionDenied(
        { looking: false, hint: "", block: null, requests: 1 },
        { blocked: block === "settings", needsLocation: needsLocationRef.current },
      );
      setHintStatus(next.hint);
    } else if (payloadTooLarge(err)) setHintStatus(LISTS_TOO_BIG);
    else setHintStatus(err instanceof Error ? err.message : RADIO_DOWN);
  }

  function leaveLookingForRadio(code: string) {
    stopNearbyRef.current?.();
    stopNearbyRef.current = null;
    setLooking(false);
    lookingRef.current = false;
    setLive(false);
    const block = code === "LOCATION_OFF" ? "location" : "bluetooth";
    pendingBlockRef.current = block;
    setRadioBlock(block);
    setHintStatus(block === "location" ? LOCATION_OFF_HINT : BLUETOOTH_OFF_HINT);
  }

  function stopLooking() {
    setLooking(false);
    lookingRef.current = false;
    pendingBlockRef.current = null;
    setRadioBlock(null);
    setLegacyHint("");
    setLive(false);
    stopNearbyRef.current?.();
    stopNearbyRef.current = null;
  }

  function addCard(list: "have" | "want", card: Card, keepSheet = false) {
    if (list === "have") setHave((prev) => upsertCard(prev, card));
    else setWant((prev) => upsertCard(prev, card));
    if (!keepSheet) setAddingFor(null);
    setTab(list);
  }

  function ingestPeer(peer: Presence, source: MatchSource, force = false, distanceM?: number) {
    if (peer.ts === 0) return;
    if (settingsRef.current.blockedIds?.includes(peer.userId)) return;
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

  function blockPeer(userId: string) {
    const blocked = [...(settingsRef.current.blockedIds ?? []), userId];
    remember({ ...settingsRef.current, blockedIds: blocked });
    setMatches((prev) => prev.filter((m) => m.peer.userId !== userId));
    setActivePing(null);
  }

  function hearAgain() {
    seenRef.current = new Set();
    saveSeenMatchIds([]);
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
    const demo = complementaryDemoPresence(haveRef.current, wantRef.current, {
      note: settingsRef.current.lookingNote?.trim() || "Red hoodie. Back table.",
    });
    ingestPeer(demo, "demo", true);
    setTab("nearby");
  }

  useEffect(() => {
    if (!live) return;
    if (canUsePhoneNearby()) {
      const beat = () => {
        void updatePhoneNearby(currentPresence()).catch((err) => {
          if (payloadTooLarge(err)) setHintStatus(LISTS_TOO_BIG);
        });
      };
      beat();
      const id = window.setInterval(beat, 12_000);
      return () => window.clearInterval(id);
    }
    const local = connectLocalHub((p) => ingestPeer(p, "ble"));
    const beat = () => local.publish(currentPresence());
    beat();
    const id = window.setInterval(beat, 12_000);
    return () => {
      window.clearInterval(id);
      local.disconnect();
    };
  }, [live, settings.userId, settings.displayName, settings.lookingNote, have, want]);

  const livePeersNote = matches.length;

  return (
    <div className="app">
      {!settings.ageOk && !ageBlocked ? (
        <div className="ping-sheet">
          <div className="sheet">
            <h2 className="ping-title">{AGE_TITLE}</h2>
            <p className="lede">{AGE_BODY}</p>
            <div className="sheet-actions">
              <button className="btn ember full" onClick={() => remember({ ...settings, ageOk: true })}>
                {AGE_YES}
              </button>
              <button className="btn secondary full" onClick={() => setAgeBlocked(true)}>
                {AGE_NO}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {ageBlocked ? (
        <div className="ping-sheet">
          <div className="sheet">
            <p className="lede">{AGE_BLOCKED}</p>
          </div>
        </div>
      ) : null}
      <header className="topbar">
        <div>
          <h1 className="brand" aria-label="TableTrade">
            Table<span>Trade</span>
          </h1>
          <p className="tag">Pokémon trades here, now. Close by.</p>
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
            intro={have.length === 0 ? <HaveFirstRun showInstall={!isStandalonePwa() && !Capacitor.isNativePlatform()} /> : null}
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
            looking={looking}
            hintStatus={hintStatus}
            brokerStatus={brokerStatus}
            matches={matches}
            liveCount={livePeersNote}
            seedNote={seedNote}
            onLookingNote={(lookingNote) => remember({ ...settings, lookingNote })}
            onStartLooking={startLooking}
            onStopLooking={stopLooking}
            radioBlock={radioBlock}
            legacyHint={legacyHint}
            needsLocation={needsLocation}
            onOpenLocationSettings={() => void openLocationSettings()}
            onOpenAppSettings={() => void openAppSettings()}
            onEnableBluetooth={() => void enableBluetooth()}
            onDemo={fireDemo}
            onHearAgain={hearAgain}
            onOpenPing={setActivePing}
          />
        )}
        {tab === "you" && (
          <YouPane
            settings={settings}
            installed={isStandalonePwa()}
            showInstall={!Capacitor.isNativePlatform()}
            onName={(displayName) => remember({ ...settings, displayName })}
            onLookingNote={(lookingNote) => remember({ ...settings, lookingNote })}
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
      {activePing && (
        <PingSheet match={activePing} onClose={() => setActivePing(null)} onBlock={blockPeer} />
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
  looking,
  hintStatus,
  matches,
  seedNote,
  onLookingNote,
  onStartLooking,
  onStopLooking,
  radioBlock,
  legacyHint,
  needsLocation,
  onOpenLocationSettings,
  onOpenAppSettings,
  onEnableBluetooth,
  onDemo,
  onHearAgain,
  onOpenPing,
}: {
  settings: Settings;
  live: boolean;
  looking: boolean;
  hintStatus: string;
  brokerStatus: "idle" | "live" | "error";
  matches: TradeMatch[];
  liveCount: number;
  seedNote: string;
  onLookingNote: (note: string) => void;
  onStartLooking: () => void;
  onStopLooking: () => void;
  radioBlock: NearbyBlock | null;
  legacyHint: string;
  needsLocation: boolean;
  onOpenLocationSettings: () => void;
  onOpenAppSettings: () => void;
  onEnableBluetooth: () => void;
  onDemo: () => void;
  onHearAgain: () => void;
  onOpenPing: (m: TradeMatch) => void;
}) {
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
        {looking ? (
          <>
            <div className="toggle-row">
              <div>
                <strong>You’re looking</strong>
                <p className="hint">{checkInHint(true)}</p>
              </div>
              <button className="btn secondary" onClick={onStopLooking}>
                {LEAVE_LOOKING}
              </button>
            </div>
            <label className="hint" htmlFor="here-note">
              {HERE_NOTE_LABEL}
            </label>
            <input
              id="here-note"
              className="field"
              maxLength={HERE_NOTE_MAX}
              placeholder={HERE_NOTE_PLACEHOLDER}
              value={settings.lookingNote ?? ""}
              onChange={(e) => onLookingNote(e.target.value.slice(0, HERE_NOTE_MAX))}
            />
            <p className="hint">{HERE_NOTE_HINT}</p>
            {!settings.photo ? <p className="hint">{YOU_PHOTO_HINT} Add one on You.</p> : null}
            {legacyHint ? <p className="callout warn" role="status">{legacyHint}</p> : null}
            {hintStatus ? <p className="hint">{hintStatus}</p> : null}
          </>
        ) : (
          <>
            <div>
              <strong>Check in</strong>
              <p className="hint">{checkInHint(false)}</p>
            </div>
            <p className="hint">{locationHintCopy()}</p>
            {showLocationAsk(needsLocation, radioBlock) ? <p className="hint">{LOCATION_ASK}</p> : null}
            <button className="btn ember full" onClick={onStartLooking}>
              {CHECKIN_CTA}
            </button>
            {legacyHint ? <p className="callout warn" role="status">{legacyHint}</p> : null}
            {hintStatus ? <p className="hint">{hintStatus}</p> : null}
            {radioBlock === "settings" ? (
              <button className="btn secondary full" onClick={onOpenAppSettings}>
                {OPEN_APP_SETTINGS}
              </button>
            ) : null}
            {radioBlock === "location" ? (
              <button className="btn secondary full" onClick={onOpenLocationSettings}>
                {OPEN_LOCATION_SETTINGS}
              </button>
            ) : null}
            {radioBlock === "bluetooth" ? (
              <button className="btn secondary full" onClick={onEnableBluetooth}>
                {TURN_ON_BLUETOOTH}
              </button>
            ) : null}
          </>
        )}
      </div>

      {import.meta.env.DEV ? (
        <button className="btn ember full demo-after-checkin" onClick={onDemo}>
          See a demo ping now
        </button>
      ) : null}
      {seedNote ? <p className="hint">{seedNote}</p> : null}
      <p className="hint">{MATCH_PRINTING}</p>

      <h3 className="panel-title" style={{ marginTop: 18 }}>
        Pings
      </h3>
      {matches.length === 0 ? (
        <div className="empty">No pings yet.</div>
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
              {m.peer.note ? <div className="hint">{m.peer.note}</div> : null}
            </button>
          ))}
        </div>
      )}
      {matches.length > 0 ? (
        <button className="btn secondary" onClick={onHearAgain} style={{ marginTop: 12 }}>
          {HEAR_AGAIN}
        </button>
      ) : null}
    </section>
  );
}

function YouPane({
  settings,
  installed,
  showInstall,
  onName,
  onLookingNote,
  onOpenPhoto,
  onClearPhoto,
  onDemoMode,
  onDemo,
}: {
  settings: Settings;
  installed: boolean;
  showInstall: boolean;
  onName: (name: string) => void;
  onLookingNote: (note: string) => void;
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
        <label className="hint" htmlFor="you-here-note">
          {HERE_NOTE_LABEL}
        </label>
        <input
          id="you-here-note"
          className="field"
          maxLength={HERE_NOTE_MAX}
          placeholder={HERE_NOTE_PLACEHOLDER}
          value={settings.lookingNote ?? ""}
          onChange={(e) => onLookingNote(e.target.value.slice(0, HERE_NOTE_MAX))}
        />
        <p className="hint">{HERE_NOTE_HINT}</p>
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
        {import.meta.env.DEV ? (
          <>
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
          </>
        ) : null}
      </div>
      <h3 className="panel-title">What this is</h3>
      <p className="lede">{YOU_WHAT}</p>
      <ul className="privacy-lines">
        <li>{PRIVACY_LISTS}</li>
        <li>{PRIVACY_PING}</li>
        <li>{PRIVACY_FAN}</li>
      </ul>
      <p className="hint">
        A product of {COMPANY}. {BUILT_BY}.
      </p>
      <ul className="privacy-lines">
        <li>
          <a href={SITE_APP_PAGE}>About TableTrade</a>
        </li>
        <li>
          <a href={SITE_HOME}>{COMPANY}</a>
        </li>
        <li>
          <a href={`mailto:${HELP_MAIL}`}>{HELP_MAIL}</a>
        </li>
        <li>
          <a href={SITE_PRIVACY}>Privacy</a>
        </li>
      </ul>
      {showInstall ? (
        <>
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
        </>
      ) : null}
    </section>
  );
}

function PingSheet({ match, onClose, onBlock }: { match: TradeMatch; onClose: () => void; onBlock: (id: string) => void }) {
  const give = match.youCanGive[0];
  const get = match.youCanGet[0];
  const note = match.peer.note?.trim();
  return (
    <div className="ping-sheet" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <Face name={match.peer.name} photo={match.peer.photo} large />
        <div className="ping-kicker">{match.source === "demo" ? "Demo ping" : "Here, now"}</div>
        <h2 className="ping-title">
          {match.peer.name} {PING_HERE}
        </h2>
        {note ? <p className="hint">{note}</p> : null}
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
          {match.source !== "demo" ? (
            <button className="btn secondary full" onClick={() => onBlock(match.peer.userId)}>
              {REPORT_PEER}
            </button>
          ) : null}
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
