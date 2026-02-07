---
type: PageLayout
title: Work Projects
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
    title: Work Projects
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
    colors: colors-f
    columns: 1
    items:
      - type: FeaturedItem
        title: Turnover Readiness Command Center
        text: >-
          Large capital projects generate thousands of completion items across
          mechanical, electrical, instrumentation, and controls disciplines—and
          tracking them in spreadsheets creates blind spots. I built a
          centralized dashboard that pulls punch list data, system completion
          status, and handover documentation into a single visual command
          center. The system updates in real time, flags incomplete paths, and
          gives superintendents and commissioning teams immediate clarity on
          what's blocking turnover. It's eliminated hundreds of hours of manual
          reconciliation and reduced handover delays by surfacing issues weeks
          earlier than traditional tracking allowed.
        actions:
          - type: Link
            label: View project
            url: /projects/turnover-readiness
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: Controls Automation Toolset
        text: >-
          Project controls teams spend days compiling schedule updates, cost
          forecasts, and variance reports from fragmented data sources—P6
          exports, contractor submittals, budget trackers, and manual logs. I
          developed a suite of advanced Excel models with VBA automation that
          ingests this data, normalizes formats, calculates key metrics, and
          outputs executive dashboards with minimal human input. These tools
          have become the backbone of weekly reporting for
          multi-hundred-million-dollar projects, replacing error-prone manual
          processes with consistent, audit-ready outputs. The result: faster
          reporting cycles, fewer mistakes, and leadership that trusts the
          numbers.
        actions:
          - type: Link
            label: View project
            url: /projects/controls-automation
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: Schedule + Cost Insight Layer
        text: >-
          Traditional project reporting relies on people reading through dense
          schedule files and cost summaries to find what matters—a process
          that's slow, subjective, and often misses early warning signs. I
          built an AI-enabled pipeline that ingests P6 XML exports, cost
          reports, and turnover logs, then classifies activities, extracts
          critical path changes, summarizes variances, and flags emerging risks
          in plain language. The system turns raw project data into actionable
          intelligence in minutes instead of days, giving teams the ability to
          respond to cost overruns, schedule slippage, and resource conflicts
          before they compound.
        actions:
          - type: Link
            label: View project
            url: /projects/schedule-cost-insight
        styles:
          self:
            textAlign: left
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-8
          - pb-24
          - pl-4
          - pr-4
        textAlign: left
---
