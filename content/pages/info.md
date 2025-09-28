---
type: PageLayout
title: About
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg4.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 75
sections:
  - elementId: ''
    colors: colors-f
    backgroundSize: full
    text: >-
      # Bob LeMieux, Project Controls Leader

      I guide construction teams through the entire project controls lifecycle—from
      establishing the integrated master schedule to delivering data-informed
      decisions for stakeholders. Over the past decade I have led controls
      organizations on complex transportation, water, and advanced facility
      programs, championing earned value management (EVM) analytics that keep
      megaprojects predictable. My focus is on pairing collaborative field
      engagement with disciplined cost and schedule governance so owners see
      issues early, mitigate risk, and realize planned outcomes.

      Highlights include driving on-time turnover for a $1.4B transit expansion,
      rebuilding controls processes for a regional water resilience program, and
      building dashboards that translate EVM metrics into executive action.
    media:
      type: ImageBlock
      url: /images/gallery-4.jpg
      altText: Bob reviewing project controls dashboards on a construction site
    styles:
      self:
        height: auto
        width: wide
        margin:
          - mt-0
          - mb-0
          - ml-0
          - mr-0
        padding:
          - pt-16
          - pb-12
          - pl-4
          - pr-4
        textAlign: left
    type: HeroSection
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
    subtitle: 'Trusted by project owners and delivery partners:'
    items:
      - type: FeaturedItem
        title: Massachusetts Bay Transportation Authority
        text: >-
          Senior project controls advisor for the Green Line Extension, aligning
          contractor schedules with owner milestones and standing up integrated
          EVM reporting that kept the $1.4B program on baseline.
        actions:
          - type: Link
            label: View MBTA project highlights
            url: 'https://www.mbta.com/projects/green-line-extension-glx'
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: Skanska USA Civil
        text: >-
          Led cost control modernization on heavy civil pursuits, building
          analytics that blended Primavera P6, Deltek Cobra, and field quantity
          tracking for real-time performance insights.
        actions:
          - type: Link
            label: Explore Skanska Civil portfolio
            url: 'https://www.usa.skanska.com/what-we-deliver/infrastructure/'
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        title: American Water Capital Program
        text: >-
          Partnered with AECOM to stand up standardized reporting for a
          multi-state water resilience initiative, including monthly executive
          dashboards and earned schedule variance reviews.
        actions:
          - type: Link
            label: Read AECOM water program insights
            url: 'https://aecom.com/us/projects/water/'
        styles:
          self:
            textAlign: left
    columns: 3
    spacingX: 60
    spacingY: 32
    styles:
      self:
        width: wide
        padding:
          - pt-8
          - pb-8
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
  - type: LabelsSection
    colors: colors-f
    subtitle: 'Core capabilities:'
    items:
      - type: Label
        label: Primavera P6 & Schedule Risk Analysis
      - type: Label
        label: Earned Value Management & Earned Schedule
      - type: Label
        label: Deltek Cobra & Acumen Fuse
      - type: Label
        label: Power BI & Tableau Analytics
      - type: Label
        label: Construction Change Management
      - type: Label
        label: Field Progress Validation
      - type: Label
        label: Integrated Baseline Reviews
      - type: Label
        label: Collaborative Planning Workshops
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: TextSection
    variant: variant-a
    subtitle: 'Contact:'
    colors: colors-f
    text: |-
      Ready to discuss schedule recovery or EVM optimization? Send a note to
      [bob@lemieuxcontrols.com](mailto:bob@lemieuxcontrols.com) with your project
      name, current phase, and decision timeline.
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
    items:
      - type: FeaturedItem
        subtitle: 'Recent Experience:'
        text: |-
          **2022–Present**

          * Director of Project Controls, Infrastructure Programs – Leading EVM
            governance, data automation, and schedule integration across transit
            and water portfolios exceeding $3B.

          **2020–2022**

          * Senior Manager, Construction Analytics – Delivered predictive cost
            and schedule models for heavy civil pursuits and claims analysis.

          **2019–2020**

          * Program Controls Lead, Advanced Manufacturing – Implemented
            integrated master schedule, progress assurance, and change control
            for a fast-track fabrication facility.
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        subtitle: 'Education & Credentials:'
        text: |-
          **Certifications**

          * PMI Project Management Professional (PMP)
          * AACE International Planning & Scheduling Professional (PSP)
          * AACE Earned Value Professional (EVP) candidate – in progress 2024

          **Training (Last 3 Years)**

          * Deltek Cobra advanced integration workshop, 2023
          * DCMA 14-point schedule assessment masterclass, 2022
          * Tableau data storytelling for infrastructure leaders, 2021
        styles:
          self:
            textAlign: left
    columns: 2
    spacingX: 60
    spacingY: 60
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
        textAlign: left
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: ContactSection
    backgroundSize: full
    title: "Let's plan your next milestone \U0001F4C5"
    colors: colors-f
    form:
      type: FormBlock
      elementId: sign-up-form
      fields:
        - name: projectName
          label: Project Name
          hideLabel: true
          placeholder: Project or Program Name
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: phase
          label: Project Phase
          hideLabel: true
          placeholder: Current Phase (e.g., design, construction)
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: email
          label: Email
          hideLabel: true
          placeholder: Work Email
          isRequired: true
          width: full
          type: EmailFormControl
        - name: scheduleWindow
          label: Schedule Window
          hideLabel: true
          placeholder: Key milestone dates or deadlines
          isRequired: true
          width: full
          type: TextFormControl
        - name: evmFocus
          label: EVM Focus
          hideLabel: true
          placeholder: Share current EVM metrics, concerns, or reporting needs
          isRequired: true
          width: full
          type: TextareaFormControl
        - name: updatesConsent
          label: Keep me posted on project controls insights
          isRequired: false
          width: full
          type: CheckboxFormControl
      submitLabel: "Schedule a consultation \U0001F4DD"
      styles:
        self:
          textAlign: center
    styles:
      self:
        height: auto
        width: narrow
        margin:
          - mt-0
          - mb-0
          - ml-4
          - mr-4
        padding:
          - pt-12
          - pb-12
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---
