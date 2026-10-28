import { Share } from "@capacitor/share";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { INVITE_BODY, INVITE_SHARE, INVITE_TITLE, PLAY_STORE_URL } from "./lib/invite";

export function InviteSheet({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancel = false;
    void QRCode.toDataURL(PLAY_STORE_URL, {
      width: 560,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#12100e", light: "#ffffff" },
    }).then((url) => {
      if (!cancel) setSrc(url);
    });
    return () => {
      cancel = true;
    };
  }, []);

  async function share() {
    try {
      await Share.share({
        title: "TableTrade",
        text: "Install TableTrade and trade Pokémon cards with someone close by.",
        url: PLAY_STORE_URL,
        dialogTitle: INVITE_TITLE,
      });
    } catch {
      try {
        await navigator.share?.({ title: "TableTrade", url: PLAY_STORE_URL });
      } catch {
        /* dismissed */
      }
    }
  }

  return (
    <div className="search-sheet" onClick={onClose}>
      <div className="sheet invite-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 className="panel-title">{INVITE_TITLE}</h2>
        <p className="lede">{INVITE_BODY}</p>
        <div className="qr-frame">{src ? <img src={src} alt="QR code to install TableTrade" /> : <p className="hint">Preparing the code…</p>}</div>
        <p className="hint invite-url">{PLAY_STORE_URL}</p>
        <div className="sheet-actions">
          <button className="btn ember full" type="button" onClick={() => void share()}>
            {INVITE_SHARE}
          </button>
          <button className="btn secondary full" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
