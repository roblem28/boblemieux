---
type: PageLayout
title: Home
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg1.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 75
sections:
  - type: HeroSection
    elementId: ''
    colors: colors-f
    backgroundSize: full
    title: Digital Leverage
    text: >-
      <img src="/images/bob.png" alt="Bob LeMieux" style="float: right; width: 200px; margin: 0 0 16px 24px; border-radius: 8px;" />

      Computers have always been my leverage—how I compress time, reduce
      friction, and create capability where teams used to accept limits. I
      don't treat "tech" as a department or a buzzword. It's how I think:
      systems, signals, automation, and repeatability. Over the years I've
      built practical tools that behave like software—advanced Excel models,
      reusable templates, VBA/macros, and automated rollups that eliminate
      manual reporting. I've normalized messy exports into clean datasets that
      can actually be analyzed, and I've built dashboards and executive views
      that show what matters without the noise. More recently, I've pushed into
      AI-enabled workflows and agent-style systems that can extract meaning
      from documents, classify and summarize content, and turn raw information
      into decisions—faster and more consistently than traditional methods.
      That same mindset drives my special projects, including Marley1: a "small
      hardware / big capability" concept focused on portable, accessible
      computing and AI. It's not hype—it's the continuation of what I've
      always done: build the next layer of tools that makes real work easier,
      faster, and smarter.
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
          - pt-36
          - pb-24
          - pl-4
          - pr-4
        flexDirection: row-reverse
        textAlign: left
    actions: []
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-0
          - pb-0
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: HeroSection
    elementId: ''
    colors: colors-f
    backgroundSize: full
    title: Project Leadership
    subtitle: >-
      I bring four decades of experience delivering billion-dollar capital and
      industrial projects, guiding teams from concept through mechanical
      completion. As a Construction Manager, Superintendent, and Project
      Controls leader, I've owned execution at the field level and driven
      performance through scheduling, cost, forecasting, and turnover readiness
      across energy, infrastructure, and industrial sectors. My edge is the
      combination: real-world delivery plus modern enablement. I don't just run
      plans—I improve the way plans are built, measured, and communicated. I
      use data-driven methods and AI-enabled tools to tighten execution,
      surface risk early, reduce cycle time in reporting, and help teams make
      better decisions with less friction. Ready to lead at any level—shaping
      both strategy and hands-on execution—while modernizing how project
      delivery gets done.
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
          - pt-24
          - pb-48
          - pl-4
          - pr-4
        flexDirection: row-reverse
        textAlign: left
    actions: []
  - type: FeaturedProjectsSection
    elementId: ''
    colors: colors-f
    variant: variant-b
    subtitle: Projects
    actions:
      - type: Link
        label: See all projects
        url: /projects
    showDate: false
    showDescription: true
    showFeaturedImage: true
    showReadMoreLink: true
    projects:
      - content/pages/projects/project-two.md
      - content/pages/projects/project-three.md
      - content/pages/projects/project-one.md
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-24
          - pb-24
          - pl-4
          - pr-4
        textAlign: left
  - type: FeaturedPostsSection
    elementId: ''
    colors: colors-f
    variant: variant-d
    subtitle: Featured Posts
    actions:
      - type: Link
        label: See all posts
        url: /blog
    showFeaturedImage: false
    showDate: true
    showExcerpt: true
    showReadMoreLink: true
    posts:
      - content/pages/blog/post-six.md
      - content/pages/blog/post-four.md
      - content/pages/blog/post-three.md
    styles:
      self:
        height: auto
        width: narrow
        padding:
          - pt-28
          - pb-48
          - pl-4
          - pr-4
        textAlign: left
  - type: ContactSection
    colors: colors-f
    backgroundSize: full
    title: "Got an interesting project? Tell me more...💬"
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
        - name: address
          label: Address
          hideLabel: true
          placeholder: Address
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: updatesConsent
          label: Sign me up to recieve updates
          isRequired: false
          width: full
          type: CheckboxFormControl
      submitLabel: "Submit 🚀"
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
          - ml-0
          - mr-0
        padding:
          - pt-24
          - pb-24
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---
