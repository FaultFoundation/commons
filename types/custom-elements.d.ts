import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      /** Givebutter floating donation widget (loaded by widgets.givebutter.com). */
      "givebutter-widget": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}
