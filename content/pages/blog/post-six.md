---
type: PostLayout
title: How I Structure and Organize a Modern Next.js Project
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg1.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 75
date: '2024-06-03'
author: content/data/team/bob-lemieux.json
excerpt: >-
  A clean Next.js structure is the difference between a project that scales and
  one that bogs down. Here is how I organize mine.
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
        width: narrow
        padding:
          - pt-24
          - pb-24
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---

Building modern web applications requires more than just writing code — it requires structure, scalability, and maintainability. Over the years, working across data analytics, automation systems, and AI-driven tools, I've found that the way a project is organized has a direct impact on how fast you can build, maintain, and scale it.

This post walks through how I structure my Next.js projects for clarity, scalability, and long-term maintainability.

## Why Project Structure Matters

When a project grows beyond a few pages, poor organization quickly becomes a bottleneck. A good structure helps you scale features without breaking existing code, collaborate more easily, reduce debugging time, and maintain clear separation between UI, data, and services.

For projects involving data pipelines, APIs, automation, and analytics dashboards, structure becomes even more important.

## My Preferred Folder Structure

/app
/components
/lib
/services
/hooks
/styles
/types
/utils
/public

Each folder has a specific purpose.

## /app — Core Application Routes

This is where Next.js handles routing and page layouts. Using the App Router keeps routing clean and scalable, especially when building dashboards or multi-page tools.

## /components — Reusable UI Components

Reusable UI elements live here. Breaking UI into components lets you reuse elements across pages, keep pages small and readable, and maintain consistent design.

## /lib — Core Utilities and Config

The /lib folder contains core configuration and helper utilities used across the project. This keeps infrastructure code separate from UI logic.

## /services — Business Logic

Services contain logic for interacting with APIs, databases, or external systems. Separating business logic from components prevents UI code from becoming cluttered.

## /hooks — Custom React Hooks

Custom hooks allow reusable logic for state management and side effects. They reduce duplication and keep components focused on rendering.

## /utils — Small Helper Functions

Utilities are lightweight helper functions used throughout the app. Keeping these separate avoids cluttering services or components.

## /types — Shared TypeScript Types

For larger projects, shared types improve consistency and prevent bugs — especially when working with APIs or structured data.

## /public — Static Assets

This folder stores images, icons, logos, and downloadable files. Everything here is accessible directly from the browser.

## Tips for Scalable Projects

**Keep components small.** Large components are hard to debug and reuse.

**Separate UI and data logic.** Use services or hooks instead of calling APIs directly in components.

**Use TypeScript everywhere.** It prevents silent bugs and improves maintainability.

**Create consistent naming conventions.** Consistency saves time when navigating large projects.

**Document complex logic.** Future you will thank you.

## Final Thoughts

Next.js is incredibly powerful, but without structure, projects become difficult to maintain as they grow. A well-organized codebase lets you build faster, scale easier, collaborate better, and maintain projects long-term.

For anyone building data-driven applications, automation tools, or AI-powered systems — clean architecture is just as important as the code itself.
