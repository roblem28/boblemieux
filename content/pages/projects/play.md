---
type: PageLayout
title: Play
metaDescription: >-
  Games and an interactive comic built by Bob LeMieux — browser voxel worlds, an
  arcade platformer, flash cards, and a Silver Age comic book.
socialImage: /images/bob.jpg
colors: colors-a
sections:
  - type: HeroSection
    elementId: ''
    colors: colors-f
    backgroundSize: full
    title: Play
    subtitle: ''
    text: >-
      The side of the workshop that exists because a grandson asked for it.
      Browser games and an interactive comic, all built from scratch and all
      running client-side.
    actions: []
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-16
          - pb-8
          - pl-4
          - pr-4
        flexDirection: row
        textAlign: left
  - type: FeaturedItemsSection
    colors: colors-f
    columns: 2
    variant: variant-a
    items:
      - type: FeaturedItem
        title: VoxelCraft
        subtitle: Three.js · WebGL · JavaScript
        text: |-
          Browser-based procedural voxel world, single-file Three.js, with a kid
          mode for young players.

          _Requires a desktop browser with keyboard and mouse._
        actions:
          - type: Link
            label: Play VoxelCraft
            url: /games/voxelcraft/index.html
            target: _blank
            rel: noopener noreferrer
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: Flash Frenzy
        text: >-
          Interactive flash card game — quiz, flip, and 60-second speed modes
          with a streak-powered BLITZ multiplier.
        actions:
          - type: Link
            label: Play Flash Frenzy
            url: https://flash-frenzy.netlify.app
            target: _blank
            rel: noopener noreferrer
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: The Cheeseburgler
        subtitle: HTML5 Canvas · JavaScript · Kids Game
        text: >-
          Browser arcade game for kids — sneak around the diner, steal
          cheeseburgers, dodge Chef Pickles. Pure HTML5 canvas, no dependencies.
          Keyboard + touch controls.
        actions:
          - type: Link
            label: Play The Cheeseburgler
            url: /games/cheeseburgler.html
            target: _blank
            rel: noopener noreferrer
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: "Bob & Kenny in: GAS STATION GUMMIES!"
        subtitle: Interactive Comic · SVG · JavaScript
        text: >-
          Silver Age Marvel style interactive comic book (Issue #1). Join Bob &
          Kenny on a 3 AM gas station trip featuring branching paths, WebAudio SFX,
          and halftone art.
        actions:
          - type: Link
            label: Read Comic
            url: /comics/gas-station-gummies.html
            target: _blank
            rel: noopener noreferrer
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: ObstacleBoy
        subtitle: Unity · WebGL · Kids Game
        text: |-
          Unity auto-runner for kids — duck, jump and lean past gates across five
          levels and three difficulty modes. One-thumb touch controls, and every
          sound in it is synthesised in C# at runtime rather than loaded.

          _Best played in landscape._
        actions:
          - type: Link
            label: Play ObstacleBoy
            url: /games/obstacleboy/
            target: _blank
            rel: noopener noreferrer
        styles:
          self:
            textAlign: left
    actions:
      - type: Link
        label: Back to Projects
        url: /projects
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-8
          - pb-24
          - pl-4
          - pr-4
        justifyContent: flex-start
---
