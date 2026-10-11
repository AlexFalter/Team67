import type { ComponentPropsWithoutRef } from "react";
import "./pixelPanel.css";

type PixelPanelProps =
  | ({ as: "form" } & ComponentPropsWithoutRef<"form">)
  | ({ as?: "div" } & ComponentPropsWithoutRef<"div">);

/** Shared countdown-style frame for game and menu panels. */
export function PixelPanel(props: PixelPanelProps) {
  if (props.as === "form") {
    const { as, className = "", ...rest } = props;
    void as;
    return <form {...rest} className={`pixel-panel ${className}`} />;
  }
  const { as, className = "", ...rest } = props;
  void as;
  return <div {...rest} className={`pixel-panel ${className}`} />;
}
