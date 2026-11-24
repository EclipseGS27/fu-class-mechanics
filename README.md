# Fabula Ultima Advanced Class Mechanics

One window for the classes that need more than a character sheet, for the Project FU system (Foundry v13, Project FU 4.14+). It uses Project FU's own class features (arcana, vehicles, therioforms, symbols, dances, verses, ingredients…), and adds the missing pieces: the Ace of Cards deck, a Pilot's vehicle on the map, symbols on creatures, and animations for all of it.

## Install
In Foundry: Add-on Modules → Install Module → paste this Manifest URL:
`https://github.com/EclipseGS27/fu-class-mechanics/releases/latest/download/module.json`

Open it with **Class mechanics** in a character sheet header, or the diamond button in the token controls (it opens for the selected token). There is one tab per class the character has.

## Classes
- **Ace of Cards**: the full deck from the class rules: 30 cards (two jokers, values 1–7 in four suits), a hand of 5 dealt when combat starts, a discard pile that is reshuffled when the deck runs out, and everything shuffled back when combat ends.
  - Select cards to see which sets they make (Jackpot, Magic Flush, Blinding Flush, Full Status, Triple Support, Double Trouble, Magic Pair), with jokers read the best way and the damage or healing worked out, including the level 20 / 40 bonus.
  - **Resolve set** spends 5 MP per card (2 cards, plus 1 per level in Magic Cards, up to 5), posts the effect with apply-damage and recover links, and draws back up.
  - **High or Low** is added when you have it. **Mulligan** and **Trap Card** check the card limits and suits. A reminder is shown for **Double or Nothing**.
  - Each suit's damage type can be changed (defaults: ♦ air, ♣ earth, ♥ fire, ♠ ice).
- **Arcanist**: Summon or dismiss an arcanum (one at a time). The merge or dismiss effect is posted and a summoning circle plays on the token.
- **Chanter**: keys, tones and verses; Perform opens Project FU's verse composer.
- **Dancer**: dance (posts it, sparkles on the token) and keep track of the current dance until you end it.
- **Gourmet**: taste totals, ingredient quantities (+ / −), and Cook opens Project FU's cooking window.
- **Merchant**: Trade Points (+ / −, **Rested** for the SL + 1 gained after resting, **Spend 2** with a chat note), capped at SL + 3, the Winds of Trade options, and a link to Fabula Ultima Shop & Economy when it is installed.
- **Mutant**: transform and revert therioforms, with a flash on the token and the form posted to chat.
- **Pilot**: activate a vehicle, embark and disembark, and equip modules.
  - **Put on the map** places the vehicle as its own token next to the pilot, with an arrival animation. Mechs are 2×2.
  - When the pilot **embarks**, the vehicle moves under them and follows wherever the pilot's token goes. **Send away** removes it, and deactivating the vehicle removes it too.
  - The token image can be set per vehicle. Vehicle actors go in a "Pilot vehicles" folder, owned by the pilot's players.
- **Symbolist**: apply a symbol to your targets (or yourself). It becomes an effect on the creature, with a glyph animation, and replaces any symbol they already bore. The tab lists every symbol you have on the scene, to **Trigger** (posts it and destroys it) or **Destroy**.
- **Tinkerer**: alchemy, infusions and magitech, with a link to Fabula Ultima Projects & Downtime when it's installed.
- **Other features**: Esper, Floralist and Invoker features, with roll buttons.

## Settings
Class animations (client), Ace of Cards deal at combat start, Pilot: place the vehicle when embarking, Pilot: remove the vehicle when deactivated.

Creating vehicle tokens and putting symbols on other creatures runs on the GM's client, so a GM must be online.

Fonts: Antonio and PT Sans, SIL Open Font License (see fonts/).
