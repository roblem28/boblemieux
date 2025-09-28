---
type: PageLayout
title: GrooveCraft Studio
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/retro-bg.svg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: repeat
  opacity: 65
sections:
  - type: HeroSection
    elementId: hero
    colors: colors-b
    backgroundSize: inset
    title: |-
      GROOVECRAFT
      STUDIO
    subtitle: Analog daydreams for the digital age.
    text: >-
      Crafted like a mixtape from 1977, our studio shapes immersive, soulful
      digital worlds where every pixel hums with warmth, texture, and rhythm.
      We combine analog curiosity with modern tooling to make interfaces feel
      like liner notes you can step inside.
    media:
      type: ImageBlock
      url: /images/retro-sunburst.svg
      altText: Radiant retro sunburst illustration
    actions:
      - type: Button
        label: Spin the reel
        url: '#vibes'
        showIcon: true
        icon: play
        style: secondary
      - type: Link
        label: See the showcase
        url: /projects
        showIcon: true
        icon: arrowRightCircle
    styles:
      self:
        height: auto
        width: wide
        margin:
          - mt-20
          - mb-6
          - ml-0
          - mr-0
        padding:
          - pt-28
          - pb-28
          - pl-8
          - pr-8
        textAlign: left
        flexDirection: row
        borderRadius: xx-large
        borderWidth: 4
        borderStyle: solid
        borderColor: 'border-white/30'
  - type: TextSection
    elementId: vibes
    colors: colors-f
    variant: variant-b
    title: What does a GrooveCraft experience feel like?
    subtitle: Blended analog grit, cosmic gradients, and storytelling that moves like a vinyl groove.
    text: >-
      ### The 70’s lens we look through

      - **Sound-first design:** we map each screen to a track on the set list so
        the narrative builds verse by verse.
      - **Texture over templates:** grain, gradients, and playful serifs give
        digital canvases the warmth of print.
      - **Playful tech:** motion, AI prompts, and modular systems engineered to
        riff as your brand evolves.

      Every project is a concept album — immersive, cohesive, and impossible to
      forget once the chorus hits.
    styles:
      self:
        width: wide
        padding:
          - pt-16
          - pb-16
          - pl-4
          - pr-4
        textAlign: left
  - type: FeaturedItemsSection
    colors: colors-c
    title: House Specialties
    subtitle: Signature services pressed straight from the GrooveCraft control room.
    columns: 3
    spacingX: 32
    spacingY: 32
    items:
      - type: FeaturedItem
        title: Mixtape Strategy
        subtitle: Narratives sequenced like a double LP.
        text: >-
          We choreograph launches as story arcs, scoring each touchpoint with
          moodboards, sonic cues, and analog-inspired motion.
        featuredImage:
          type: ImageBlock
          url: /images/retro-cassette.svg
          altText: Retro cassette illustration
        styles:
          self:
            padding:
              - p-8
            borderRadius: xx-large
            borderWidth: 2
            borderStyle: solid
            borderColor: 'border-white/30'
            backgroundColor: 'bg-white/10'
            className: 'shadow-2xl backdrop-blur-sm'
            textAlign: left
      - type: FeaturedItem
        title: Chromatic Systems
        subtitle: Color science with soul.
        text: >-
          Palette architectures, typography stacks, and UI atoms tuned to
          era-specific vibes while staying future ready.
        featuredImage:
          type: ImageBlock
          url: /images/retro-mosaic.svg
          altText: Retro mosaic tile illustration
        styles:
          self:
            padding:
              - p-8
            borderRadius: xx-large
            borderWidth: 2
            borderStyle: solid
            borderColor: 'border-white/30'
            backgroundColor: 'bg-white/10'
            className: 'shadow-2xl backdrop-blur-sm'
            textAlign: left
      - type: FeaturedItem
        title: Analog Motion
        subtitle: Scrolls that feel like stage lights.
        text: >-
          Microinteractions, tape-warp transitions, and storytelling loops that
          crescendo exactly when the beat drops.
        featuredImage:
          type: ImageBlock
          url: /images/retro-waves.svg
          altText: Retro neon wave illustration
        styles:
          self:
            padding:
              - p-8
            borderRadius: xx-large
            borderWidth: 2
            borderStyle: solid
            borderColor: 'border-white/30'
            backgroundColor: 'bg-white/10'
            className: 'shadow-2xl backdrop-blur-sm'
            textAlign: left
    styles:
      self:
        width: wide
        padding:
          - pt-20
          - pb-20
          - pl-4
          - pr-4
        textAlign: left
        borderRadius: xx-large
        borderWidth: 4
        borderStyle: solid
        borderColor: 'border-white/30'
  - type: MediaGallerySection
    colors: colors-f
    title: Moodboard
    subtitle: Select frames from recent dreamscapes and palette experiments.
    images:
      - type: ImageBlock
        url: /images/retro-aurora.svg
        altText: Aurora inspired retro illustration
        caption: Cosmic bloom gradients
      - type: ImageBlock
        url: /images/retro-sunburst.svg
        altText: Radiant sunburst collage
        caption: Sunset supergraphics
      - type: ImageBlock
        url: /images/retro-mosaic.svg
        altText: Mosaic color study
        caption: Modular color masonry
      - type: ImageBlock
        url: /images/retro-waves.svg
        altText: Neon wave layers
        caption: Oceanic synth wave
    columns: 2
    spacing: 28
    aspectRatio: 1:1
    showCaption: true
    enableHover: true
    styles:
      self:
        width: wide
        padding:
          - pt-16
          - pb-20
          - pl-4
          - pr-4
        textAlign: left
  - type: QuoteSection
    colors: colors-f
    quote: '“Design is the mixtape where every screen flips like the verse you never skip.”'
    name: Lumen Flux
    title: Creative Director, GrooveCraft Studio
    styles:
      self:
        width: narrow
        padding:
          - pt-12
          - pb-16
          - pl-4
          - pr-4
        textAlign: center
  - type: ContactSection
    colors: colors-d
    backgroundSize: inset
    title: "Let's Jam on Your Next Vision"
    text: >-
      Drop us a line with the vibe, the deadline, and the wildest inspiration
      image you’ve got. We’ll spin it into a concept deck before the chorus hits.
    form:
      type: FormBlock
      elementId: groove-form
      fields:
        - name: yourName
          label: Your Name
          hideLabel: true
          placeholder: Your Name
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: email
          label: Email
          hideLabel: true
          placeholder: Email
          isRequired: true
          width: 1/2
          type: EmailFormControl
        - name: projectFocus
          label: Project Focus
          hideLabel: true
          placeholder: "What's the main groove?"
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: timeline
          label: Timeline
          hideLabel: true
          placeholder: When do we drop it?
          isRequired: false
          width: 1/2
          type: TextFormControl
        - name: visionNotes
          label: Vision Notes
          hideLabel: true
          placeholder: Tell us about your analog dream.
          isRequired: true
          width: full
          type: TextareaFormControl
        - name: updatesConsent
          label: Keep me tuned to studio broadcasts
          isRequired: false
          width: full
          type: CheckboxFormControl
      submitLabel: Send the signal
      styles:
        self:
          textAlign: left
    media:
      type: ImageBlock
      url: /images/retro-aurora.svg
      altText: Retro aurora illustration
    styles:
      self:
        width: wide
        padding:
          - pt-20
          - pb-24
          - pl-6
          - pr-6
        textAlign: left
        flexDirection: row
        borderRadius: xx-large
        borderWidth: 4
        borderStyle: solid
        borderColor: 'border-white/30'
---
