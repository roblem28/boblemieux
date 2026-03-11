---
type: PostLayout
title: The Great Unbundling
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg1.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 75
date: '2026-03-10'
author: content/data/team/bob-lemieux.json
excerpt: >-
  Monolithic platforms are giving way to modular systems. That shift feels familiar to anyone who has spent decades breaking complex projects into components that actually work.
bottomSections:
  - elementId: ''
    type: RecentPostsSection
    colors: colors-f
    variant: variant-d
    subtitle: Recent posts
    showDate: true
    showAuthor: false
    showExcerpt: true
    recentCount: 2
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-12
          - pb-56
          - pr-4
          - pl-4
        textAlign: left
    showFeaturedImage: true
    showReadMoreLink: true
  - type: ContactSection
    backgroundSize: full
    title: 'Stay up-to-date with my words ✍️'
    colors: colors-f
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
          width: full
          type: EmailFormControl
        - name: updatesConsent
          label: Sign me up to recieve my words
          isRequired: false
          width: full
          type: CheckboxFormControl
      submitLabel: "Submit \U0001F680"
      styles:
        self:
          textAlign: center
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-24
          - pb-24
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---

Technology tends to evolve in cycles.

First things get bundled together into large systems that try to do everything. Over time those systems become complicated, slow to adapt, and difficult to change. Eventually something breaks the model apart.

That's when unbundling begins.

We're seeing that happen again today across software, data platforms, and artificial intelligence. Large monolithic systems are giving way to smaller, specialized tools that can be combined into more flexible, resilient architectures.

From my perspective, this shift feels familiar. For most of my career I worked on large industrial and capital projects where complex systems had to be broken down into manageable components. You simply cannot deliver a massive project without dividing it into clear systems and subsystems with well-defined interfaces between them. Modern technology is moving in exactly the same direction — and for exactly the same reasons.

## From Monolithic Platforms to Modular Systems

In the early days of enterprise software, companies relied on large platforms that tried to do everything — data storage, reporting, workflow management, analytics, user interfaces, integrations — all bundled together. That simplified procurement but created rigid environments where innovation moved slowly and change was expensive.

Today the model is shifting. Instead of relying on a single platform, organizations are building systems from best-of-breed components that connect through APIs and shared data layers. A modern system might combine a composable web front-end, specialized analytics platforms, automation workflows, AI services, cloud infrastructure, and custom applications. This allows organizations to move faster and adopt new technology without replacing entire systems.

I've built exactly these kinds of stacks. The construction data platform I run pulls from P6, Procore, and custom Excel engines — each doing what it does best, connected through clean data interfaces. The same principle applies whether you're managing a capital project or designing a software architecture.

## The Role of APIs and Cloud Platforms

A major driver behind the great unbundling is the rise of cloud infrastructure and APIs. In the past, connecting different systems required complicated integration projects. Today most platforms are designed from the start to communicate with other services.

That means individual components can evolve independently while still functioning as part of a larger ecosystem. This has dramatically lowered the barrier to building sophisticated digital systems. What once required a large development organization can now be done by small teams — or even individuals who understand how the pieces fit together.

That's not a small thing. It's a structural shift in who gets to build.

## Where AI Fits Into the Picture

Artificial intelligence is accelerating the unbundling process. AI capabilities are increasingly delivered as services rather than built directly into large applications. You plug them into existing workflows through APIs and automation tools.

I use AI this way across multiple systems — document analysis, schedule risk flagging, code generation, decision support. Because these services evolve rapidly, modular architectures let you adopt improvements without rebuilding everything around them. Marley1, my portable AI and compute platform, is designed on this principle: modular hardware, modular software, composable intelligence layers. Swap a model, upgrade a service, add a capability — without touching the rest of the system.

In many ways, AI is becoming just another component in a composable architecture. A powerful one, but a component nonetheless.

## Lessons From Large Projects

One thing decades of working on large projects teaches you is that complex systems only succeed when they are structured carefully. You break systems down into components. You define clear interfaces between those components. You ensure each part performs its function reliably. And you design for the reality that things will change.

That approach translates directly to modern digital systems. Whether you're building infrastructure, software platforms, or AI-enabled workflows, the challenge is the same: design systems that can evolve without collapsing under their own complexity. Unbundling allows that evolution to happen.

## The Opportunity Ahead

The great unbundling is creating an environment where innovation can happen much faster. Instead of waiting for large vendors to update their platforms, organizations can assemble systems using the best available tools — and individuals who understand both systems thinking and modern technology can build things that would have required entire teams a decade ago.

That's the opportunity. And it's wide open for people who know how the pieces fit together.

## Final Thoughts

Every generation of technology reshapes how systems are built. Today we are moving away from rigid monolithic platforms toward flexible composable systems made up of specialized components.

For someone who spent decades working in environments where complex systems had to function reliably under pressure, this transition makes complete sense. Good systems — whether physical or digital — are rarely built as one giant structure. They're built piece by piece, with each component designed to do its job well.

That principle is just as relevant in the age of AI as it was in the age of large industrial projects. In many ways, it's only becoming more important.
