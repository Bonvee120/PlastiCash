import { ImageResponse } from "next/og";

// Social card for links shared on WhatsApp, X and Facebook: brand forest, the headline and the promise.
// Uses the default font of next/og (no font file to load), so it renders the same everywhere.
export const alt = "PlastiCash by EcoCyclers: your plastic is money. Sell plastic in Enugu by weight, paid to your bank.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "white",
          background: "linear-gradient(160deg, #052E16 0%, #14532D 55%, #166534 100%)",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>
          Plasti<span style={{ color: "#FBBF24" }}>Cash</span>
          <span style={{ marginLeft: 16, fontSize: 24, fontWeight: 600, color: "#86EFAC", alignSelf: "center" }}>by EcoCyclers · Enugu</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em" }}>
            Your plastic is&nbsp;<span style={{ color: "#FBBF24" }}>money.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 34, color: "#DCFCE7" }}>
            Weighed in front of you. Confirmed by you. Paid to your bank.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
