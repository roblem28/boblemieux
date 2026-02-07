---
type: PageLayout
title: Projects
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg1.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 50
sections:
  - type: HeroSection
    title: Projects
    subtitle: ''
    actions: []
    colors: colors-f
    backgroundSize: full
    elementId: ''
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
    title: Work Projects
    colors: colors-f
    columns: 3
    items:
      - type: FeaturedItem
        title: Turnover Readiness Command Center
        text: >-
          A unified dashboard system that tracks completion status, punch
          progress, and handover readiness across hundreds of systems in real
          time.
        actions:
          - type: Link
            label: Learn more
            url: /projects/turnover-readiness
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: Controls Automation Toolset
        text: >-
          Custom-built Excel engines with VBA automation that consolidate
          schedule, cost, and forecasting data into executive-ready reports.
        actions:
          - type: Link
            label: Learn more
            url: /projects/controls-automation
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: Schedule + Cost Insight Layer
        text: >-
          AI-enabled extraction and classification system that reads P6 exports,
          cost reports, and turnover logs to identify trends and flag risks.
        actions:
          - type: Link
            label: Learn more
            url: /projects/schedule-cost-insight
        styles:
          self:
            textAlign: left
    actions:
      - type: Link
        label: View all Work Projects
        url: /work-projects
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
  - type: FeaturedItemsSection
    title: Tech Projects
    colors: colors-f
    columns: 3
    items:
      - type: FeaturedItem
        title: Marley1
        text: >-
          A portable AI + compute platform designed for field-ready
          intelligence—small hardware, big capability.
        actions:
          - type: Link
            label: Learn more
            url: /projects/marley1
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: BobLemieux.ai Personal LLM Ecosystem
        text: >-
          A self-hosted AI stack combining local models, fine-tuned agents, and
          document processing pipelines.
        actions:
          - type: Link
            label: Learn more
            url: /projects/boblemieux-ai
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: The Lynda Project
        text: >-
          An experimental AI companion system focused on memory, context, and
          conversational continuity.
        actions:
          - type: Link
            label: Learn more
            url: /projects/lynda
        styles:
          self:
            textAlign: left
    actions:
      - type: Link
        label: View all Tech Projects
        url: /tech-projects
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-12
          - pb-24
          - pl-4
          - pr-4
        textAlign: left
---
