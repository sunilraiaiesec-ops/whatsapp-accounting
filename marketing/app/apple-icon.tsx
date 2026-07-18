import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3d6b32 0%, #2ca01c 45%, #c9972e 100%)",
          borderRadius: 36,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -20,
            right: -20,
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.16)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            transform: "rotate(-8deg)",
            marginTop: 8,
          }}
        >
          <span
            style={{
              fontSize: 108,
              fontWeight: 900,
              color: "white",
              letterSpacing: -4,
              lineHeight: 1,
              textShadow: "0 3px 8px rgba(0,0,0,0.22)",
            }}
          >
            B
          </span>
          <span
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: "#fff7dc",
              marginBottom: 12,
              marginLeft: -4,
              letterSpacing: -2,
            }}
          >
            too
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
