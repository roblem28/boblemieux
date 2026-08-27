---
type: PageLayout
title: Contact
metaDescription: >-
  Get in touch with Bob LeMieux about project controls, scheduling, earned value
  management, or AI and edge work on capital programmes.
socialImage: /images/bob.jpg
colors: colors-a
sections:
  - type: HeroSection
    title: Contact
    subtitle: ''
    text: >-
      Scheduling, earned value, turnover readiness, or the AI and edge work —
      if it touches how a capital programme gets measured and delivered, send
      me the details and I'll tell you straight whether I can help.
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
  - type: TextSection
    colors: colors-f
    subtitle: ''
    text: >-
      **Email** — [roblem28@gmail.com](mailto:roblem28@gmail.com)


      **LinkedIn** —
      [linkedin.com/in/boblemieux](https://linkedin.com/in/boblemieux)


      **GitHub** — [github.com/roblem28](https://github.com/roblem28)


      **Résumé** — available on request; ask below or by email and I'll send it
      over.
    styles:
      self:
        height: auto
        width: narrow
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
        textAlign: left
  - type: ContactSection
    backgroundSize: full
    title: Send me a note
    colors: colors-f
    form:
      type: FormBlock
      elementId: contact
      fields:
        - name: firstName
          label: First Name
          hideLabel: false
          placeholder: First Name
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: lastName
          label: Last Name
          hideLabel: false
          placeholder: Last Name
          isRequired: false
          width: 1/2
          type: TextFormControl
        - name: email
          label: Email
          hideLabel: false
          placeholder: Email
          isRequired: true
          width: full
          type: EmailFormControl
        - name: message
          label: Message
          hideLabel: false
          placeholder: What are you working on?
          isRequired: true
          width: full
          type: TextareaFormControl
        - name: updatesConsent
          label: Sign me up to receive updates
          isRequired: false
          width: full
          type: CheckboxFormControl
      submitLabel: 'Send'
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
          - pl-4
          - pr-4
        borderRadius: none
---
