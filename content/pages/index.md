---
type: PageLayout
title: Home
metaTitle: Bob LeMieux — Project Controls Lead
metaDescription: 45 years of construction and project controls, programs to $20B. Project
  Controls Lead on a 143 MW AI data center. Builds the software, AI tools and games on this
  site.
socialImage: /images/bob.jpg
colors: colors-a
sections:
- type: HeroSection
  title: 45 years of project controls. Now I build the tools.
  colors: colors-f
  backgroundSize: full
  actions: []
  text: |-
    Civil engineer and project controls lead. Since 1981 I've scheduled and controlled capital work up to $20B: refineries, crackers, pharma, power, labs and data centers.

    Today I run project controls on a 143 MW AI data center build in Dalton, Georgia. Nights and weekends I build the software, local AI and games below.
  media:
    type: ImageBlock
    url: /images/bob.jpg
    altText: Bob LeMieux
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
  columns: 3
  items:
  - type: FeaturedItem
    title: 45 years
    text: In the field and in project controls since 1981.
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: $20B
    text: Largest program I have controlled, at Fluor.
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: 143 MW
    text: AI data center build I am on now, at Integra.
    styles:
      self:
        textAlign: left
  styles:
    self:
      height: auto
      width: wide
      padding:
      - pt-8
      - pb-12
      - pl-4
      - pr-4
      textAlign: left
- type: DividerSection
  styles:
    self:
      width: wide
      padding:
      - pt-8
      - pb-8
      - pl-4
      - pr-4
      borderWidth: 1
      borderStyle: solid
- type: FeaturedItemsSection
  colors: colors-f
  columns: 4
  title: Explore
  items:
  - type: FeaturedItem
    title: Experience
    text: Career timeline, credentials and four project write-ups from BP Whiting to Integra.
    actions:
    - type: Link
      label: Experience
      url: /work
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: Controls & AI
    text: 'Turnover, schedule and cost tools, plus Marley1: local AI on an 8 GB board.'
    actions:
    - type: Link
      label: Controls & AI
      url: /controls-ai
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: Maps & Data
    text: Live wildfire, weather and federal spending maps, and 3D twins of Earth, the Moon
      and exoplanets.
    actions:
    - type: Link
      label: Maps & Data
      url: /maps-data
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: Games & Toons
    text: Browser and Unity games, animated shorts and an interactive comic.
    actions:
    - type: Link
      label: Games & Toons
      url: /play
    styles:
      self:
        textAlign: left
  styles:
    self:
      height: auto
      width: wide
      padding:
      - pt-8
      - pb-12
      - pl-4
      - pr-4
      textAlign: left
- type: DividerSection
  styles:
    self:
      width: wide
      padding:
      - pt-8
      - pb-8
      - pl-4
      - pr-4
      borderWidth: 1
      borderStyle: solid
- type: ContactSection
  colors: colors-f
  backgroundSize: full
  title: Got a project? Tell me about it.
  form:
    type: FormBlock
    elementId: sign-up-form
    fields:
    - name: firstName
      label: First Name
      hideLabel: true
      placeholder: First Name
      isRequired: true
      width: 1/2
      type: TextFormControl
    - name: lastName
      label: Last Name
      hideLabel: true
      placeholder: Last Name
      isRequired: false
      width: 1/2
      type: TextFormControl
    - name: email
      label: Email
      hideLabel: true
      placeholder: Email
      isRequired: true
      width: 1/2
      type: EmailFormControl
    - name: message
      label: Message
      hideLabel: true
      placeholder: What are you working on?
      isRequired: true
      width: full
      type: TextareaFormControl
    submitLabel: Send
    styles:
      self:
        textAlign: center
  styles:
    self:
      height: auto
      width: narrow
      padding:
      - pt-16
      - pb-16
      - pr-4
      - pl-4
      flexDirection: row
      textAlign: left
---
