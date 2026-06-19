import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            transform: "rotate(-8deg)",
            marginTop: 2,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "white",
              letterSpacing: -1,
              lineHeight: 1,
              textShadow: "0 1px 2px rgba(0,0,0,0.25)",
            }}
          >
            B
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#fff7dc",
              marginBottom: 2,
              marginLeft: -1,
              letterSpacing: -0.5,
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
