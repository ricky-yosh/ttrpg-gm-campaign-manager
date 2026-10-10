# Greyhaven sample artwork

These eight images were generated with the built-in imagegen tool. The exact prompts are in `prompts.json`.

The JPEGs are the project artwork. `artwork.json` embeds the same files as data URLs so the sample campaign can use the existing campaign image save/load format without external URLs or filesystem dependencies.

Locations reuse their scene illustration for the GM banner and player-facing image. Factions use their own scene illustrations. The sample section pages use related scenes as banners and entry illustrations. NPC portraits, banners, tokens, and the prototype map already have sample artwork.

After changing a JPEG, run `node pack-artwork.mjs` from this directory to refresh the embedded data.
