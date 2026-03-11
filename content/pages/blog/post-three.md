---
type: PostLayout
title: 'Composable — The Future of the Web'
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
  Complex systems work best when built from well-defined components. That principle held true on large capital projects. It holds true in modern software too.
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

Over the years I've worked on projects where complexity was unavoidable. Large capital projects, engineering environments, and operations with thousands of moving parts all share one common challenge: how to organize complex systems so they remain manageable.

That same challenge now exists in modern software and web development.

As web applications become more sophisticated — combining data platforms, automation systems, analytics dashboards, and AI tools — the traditional approach of building everything as one tightly connected system becomes harder to maintain, harder to scale, and harder to fix when something breaks.

That's where composable architecture comes in. And from where I sit — having spent decades in systems-heavy environments before moving into software, automation, and AI — this isn't a new idea. It's an old one finally getting the tooling it deserves.

## What Composable Actually Means

A composable architecture breaks a system into modular parts that operate independently but connect through well-defined interfaces.

Instead of a single monolithic application, a composable system might include separate services for content management, data storage, analytics, automation workflows, authentication, AI services, and front-end rendering. Each component can evolve independently while still contributing to the overall system.

My own stack reflects this. boblemieux.ai runs on Next.js with a headless CMS, deployed via Netlify, with AI services consumed through APIs. Marley1 — my portable AI and compute platform — is designed the same way: modular hardware, modular software, clean interfaces between layers. The Pi 5 doesn't need to know what the Orin Nano is doing. It just needs the interface to work.

## Why This Matters Now

For many years, software platforms tried to solve every problem inside one integrated system. That worked fine for simpler applications. Modern digital systems interact with dozens of different tools and services — a Next.js front end, a headless CMS, AI services, analytics platforms, automation workflows, cloud APIs. Trying to manage all of that inside a single rigid application becomes a liability fast.

Composable architecture lets each part of the system do what it does best. Swap the CMS without touching the front end. Upgrade the AI service layer without rebuilding the data pipeline. Scale the analytics independently of the application server.

This is how resilient systems get built.

## Lessons From Large Projects

One thing decades of project work teaches you is that modularity isn't optional on complex systems — it's survival.

Large capital projects are never built as one giant effort. They are broken into systems: structural, mechanical, electrical, controls, operations. Each is designed and delivered separately. Each must integrate successfully for the overall facility to work. The interfaces between systems matter as much as the systems themselves.

Modern software is evolving in exactly the same direction. Composable architecture treats applications more like systems engineering — components interact through clear interfaces rather than being tightly coupled. That's not a software trend. That's just how complex systems have to work.

## Composable and AI

Artificial intelligence is accelerating the shift toward composable systems — and for good reason.

AI services evolve fast. A model that was state-of-the-art six months ago may already have a better replacement. If your AI capability is baked into a monolithic application, upgrading it means rebuilding. If it's a composable service layer consumed through an API, you swap it out and move on.

I've built AI pipelines that sit as discrete layers on top of construction data workflows — reading P6 exports, classifying cost data, flagging schedule risks — without touching the underlying reporting infrastructure. That's composable thinking applied to enterprise data. It works the same way whether you're building a web platform or an autonomous field system.

## Where This Is Headed

The future of web systems will involve even greater modularity. Applications will increasingly be assembled from specialized services rather than built from a single platform. Teams will adopt new technologies faster, replace components without disrupting the whole system, and integrate emerging tools — especially AI — without architectural rewrites.

From an engineering perspective, this is the only approach that scales. Complex systems with long operational lives can't afford to be rigid. The ones that survive are the ones designed to adapt.

## Final Thoughts

Technology keeps evolving. New tools keep appearing. But the principles behind good systems design stay remarkably consistent.

Whether you're commissioning a processing facility, delivering a large capital project, or building a modern web application — success comes from understanding how the pieces fit together and designing the interfaces between them with care.

Composable architecture applies that thinking to modern digital systems. And as software, automation, and AI continue to converge, that way of thinking will only become more valuable.
