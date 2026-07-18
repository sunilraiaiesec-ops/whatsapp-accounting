import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3d6b32 0%, #2ca01c 45%, #c9972e 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 88, fontWeight: 900, color: "white" }}>
          <span>BANTOO</span>
          <span style={{ color: "#fff7dc" }}>BOOKS</span>
        </div>
        <div style={{ marginTop: 16, fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
          Accounting software for growing businesses
        </div>
      </div>
    ),
    { ...size },
  );
}
