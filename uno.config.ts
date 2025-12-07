import { defineConfig, presetIcons } from "unocss";
import presetWind4 from "@unocss/preset-wind4";

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      collections: {
        t: () => import("@iconify-json/tabler/icons.json").then((i) => i.default),
        si: () => import("@iconify-json/simple-icons/icons.json").then((i) => i.default),
      },
      scale: 1.2,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
});
