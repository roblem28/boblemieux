---
type: PageLayout
title: Tech Projects
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
    title: Tech Projects
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
        title: Marley1
        text: >-
          Most AI and compute tools assume you're sitting at a desk with power,
          internet, and a full workstation—but real-world work doesn't always
          happen there. Marley1 is a portable platform designed to bring serious
          AI capability into the field: a compact device running local LLMs,
          agent systems, and edge processing that can operate offline or on
          limited networks. It's built for environments where traditional
          laptops are impractical and cloud dependence is a liability—industrial
          sites, remote locations, or mobile use cases that demand intelligence
          without infrastructure. The goal isn't to replace desktops; it's to
          extend capability into contexts where it's never existed before.
        actions:
          - type: Link
            label: View project
            url: /projects/marley1
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: BobLemieux.ai Personal LLM Ecosystem
        text: >-
          This site is more than a portfolio—it's a self-hosted AI lab running
          local language models, fine-tuned agents, and document processing
          pipelines. I use it to test autonomous workflows, build custom tools
          for construction data analysis, and experiment with multi-agent
          systems that can draft reports, summarize documents, and generate
          structured outputs from unstructured inputs. It's a testbed for
          next-generation project intelligence systems that don't just assist
          with tasks but execute them end-to-end with minimal human oversight.
          The infrastructure here directly informs the tools I deploy in real
          projects—it's where theory becomes execution.
        actions:
          - type: Link
            label: View project
            url: /projects/boblemieux-ai
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: The Lynda Project
        text: >-
          Named in honor of someone who believed deeply in the potential of
          technology to support human connection and capability, this project
          explores conversational AI systems with persistent memory, contextual
          awareness, and long-term continuity. It's an experimental platform
          for testing how agents can maintain relationships over time, adapt to
          evolving needs, and function as true companions rather than disposable
          tools. The focus is human-centered design—building systems that feel
          thoughtful, reliable, and genuinely helpful rather than transactional.
        actions:
          - type: Link
            label: View project
            url: /projects/lynda
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
