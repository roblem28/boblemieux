---
type: PageLayout
title: Maps & Data
metaTitle: Bob LeMieux — Maps & Data
metaDescription: 'Live maps and dashboards built on free public data: wildfire, weather, federal
  spending, campaign finance, news, and 3D twins of Earth, the Moon and exoplanets.'
socialImage: /images/earthtwin.jpg
colors: colors-a
sections:
- type: HeroSection
  title: Maps & Data
  colors: colors-f
  backgroundSize: full
  actions: []
  subtitle: Live maps and dashboards built on free public data. No logins, no API keys in
    the browser.
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
- type: FeaturedProjectsSection
  colors: colors-f
  variant: variant-b
  showFeaturedImage: true
  showDescription: true
  showReadMoreLink: true
  showDate: false
  title: Live maps and twins
  projects:
  - content/pages/projects/emberwatch.md
  - content/pages/projects/earth-twin.md
  - content/pages/projects/moon-twin.md
  - content/pages/projects/exoplanet-twin.md
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
  columns: 3
  title: Dashboards and feeds
  items:
  - type: FeaturedItem
    title: Weather Map
    text: Live NOAA/NWS radar, precipitation type, and severe-weather warnings and watches
      on a MapLibre map.
    actions:
    - type: Link
      label: Open map
      url: /projects/weather/
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: Federal Award Explorer
    text: USAspending.gov contract dollars mapped by place of performance, with a sortable
      table that exports to Excel.
    actions:
    - type: Link
      label: Open explorer
      url: /projects/spending/
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: FEC Campaign Finance Explorer
    text: OpenFEC contributions, committees, candidates and filings, with a contributor-to-federal-contract
      cross-reference.
    actions:
    - type: Link
      label: Open explorer
      url: /projects/fec/
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: NYT Daily Digest
    subtitle: Python · SQLite FTS5
    text: Searchable index of New York Times articles rebuilt from live RSS feeds, with section
      filters and keyword tags.
    actions:
    - type: Link
      label: Open digest
      url: /projects/nyt/
    styles:
      self:
        textAlign: left
  - type: FeaturedItem
    title: The AI Wire
    text: One-page AI news front page, curated by hand from RSS feeds.
    actions:
    - type: Link
      label: Read the Wire
      url: /wire/
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
---
