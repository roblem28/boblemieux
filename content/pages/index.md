---
type: PageLayout
title: Home
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg3.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 65
sections:
  - type: HeroSection
    elementId: home
    colors: colors-f
    backgroundSize: full
    title: |-
      Raise a glass at
      The Pub for What Ales You
    subtitle: >-
      Small-batch pours, scratch-made comfort bites, and a welcome as warm as our oak bar.
    text: >-
      Family-owned since 2008, we pour rotating Pacific Northwest beers, classic cocktails, and cozy vibes right in the heart of Old Town. Open Tuesday through Sunday from 3 p.m. till close.
    media:
      type: ImageBlock
      url: /images/featured-Image2.jpg
      altText: Friends clinking pint glasses in a cozy pub booth
    actions:
      - type: Button
        label: View the menu
        url: /menu
        style: primary
      - type: Link
        label: Upcoming events
        url: /events
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
          - pt-32
          - pb-32
          - pl-4
          - pr-4
        flexDirection: row
        textAlign: left
  - type: TextSection
    colors: colors-f
    variant: variant-b
    title: Crafted for neighbors, built for nights out
    subtitle: Locally loved, independently poured
    text: >-
      We’re a neighborhood hangout where brewers, winemakers, and chefs drop in to share what they’re creating. Our tap list leans toward small-batch ales, our kitchen celebrates pub favorites made from scratch, and every seat in the house is saved for real conversation.

      Settle in with a barrel-aged stout by the fireplace, split a platter of hot honey wings, or catch the game on the big screen with a house-infused old fashioned in hand. However you unwind, we’ll keep the good times flowing.
    styles:
      self:
        width: narrow
        padding:
          - pt-12
          - pb-20
          - pl-4
          - pr-4
        textAlign: left
  - type: FeaturedItemsSection
    colors: colors-f
    title: This week’s tap highlights
    subtitle: Rotating selections change every Thursday—here’s what’s pouring now.
    items:
      - type: FeaturedItem
        title: Hops & Hues IPA
        subtitle: 6.5% ABV • Sunriver Brewing
        text: >-
          A juicy, citrus-forward IPA layered with pine notes and a silky finish. Pair it with our charred poblano queso for the perfect hop-forward combo.
        featuredImage:
          type: ImageBlock
          url: /images/featured-Image3.jpg
          altText: Pint of hazy IPA with orange garnish on the bar
      - type: FeaturedItem
        title: Campfire Porter on Nitro
        subtitle: 5.8% ABV • What Ales You Collaboration
        text: >-
          Rich cocoa, toasted marshmallow, and a whisper of smoke cascade into a velvety pour. Sip it alongside our maple bacon Brussels sprouts.
        featuredImage:
          type: ImageBlock
          url: /images/featured-Image4.jpg
          altText: Nitro porter being poured from a tap handle
      - type: FeaturedItem
        title: Garden Party Spritz
        subtitle: Zero-proof • House-made
        text: >-
          A sparkling blend of cucumber, basil, and grapefruit bitters topped with tonic. Bright, refreshing, and perfect for pacing yourself through trivia night.
        featuredImage:
          type: ImageBlock
          url: /images/featured-Image5.jpg
          altText: Fresh herbal spritz mocktail garnished with basil
    actions:
      - type: Link
        label: Explore the full menu
        url: /menu
    styles:
      self:
        width: wide
        padding:
          - pt-16
          - pb-16
          - pl-4
          - pr-4
        textAlign: left
  - type: MediaGallerySection
    colors: colors-f
    subtitle: Nights at The Pub for What Ales You
    images:
      - type: ImageBlock
        url: /images/gallery-1.jpg
        altText: Bartender pouring beer from a copper tap
        caption: Our taps rotate weekly with Oregon’s best brewers
      - type: ImageBlock
        url: /images/gallery-2.jpg
        altText: Trivia night crowd raising hands to answer
        caption: Trivia Tuesdays pack the house with neighborhood teams
      - type: ImageBlock
        url: /images/gallery-3.jpg
        altText: Live acoustic duo performing near the bar
        caption: Acoustic Sundays keep the vibe mellow and warm
      - type: ImageBlock
        url: /images/gallery-4.jpg
        altText: Spread of shareable appetizers on rustic table
        caption: From smash burgers to shareables, our kitchen delivers comfort
    spacing: 28
    columns: 4
    aspectRatio: auto
    showCaption: true
    enableHover: false
    styles:
      self:
        width: wide
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        textAlign: left
  - type: TestimonialsSection
    colors: colors-f
    title: Word on the street
    subtitle: See why neighbors make The Pub their local living room.
    variant: variant-b
    testimonials:
      - type: Testimonial
        quote: >-
          “The tap list is always surprising and the staff never steers us wrong. Their bourbon peach old fashioned is worth the trip alone.”
        name: Lena H.
        title: Old Town resident
      - type: Testimonial
        quote: >-
          “Best trivia night in the city—plus the kitchen keeps the snacks coming. It feels like Cheers got a Northwest upgrade.”
        name: Marco D.
        title: Trivia team captain
    styles:
      self:
        width: narrow
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        textAlign: left
  - type: LabelsSection
    colors: colors-f
    subtitle: Weekly happenings
    items:
      - type: Label
        label: Tuesday — Taproom Trivia at 7 p.m.
      - type: Label
        label: Wednesday — Whiskey & Vinyl flights
      - type: Label
        label: Thursday — Brewer’s tasting table
      - type: Label
        label: Friday & Saturday — Live local music
      - type: Label
        label: Sunday — Comfort food supper specials
    styles:
      self:
        width: narrow
        padding:
          - pt-8
          - pb-16
          - pl-4
          - pr-4
  - type: ContactSection
    elementId: visit
    colors: colors-f
    backgroundSize: full
    title: Plan your visit
    text: >-
      **Taproom hours** — Tue–Thu 3–10 p.m., Fri–Sat 3 p.m.–midnight, Sun 2–9 p.m.

      **Find us** — 215 Taproom Lane, Old Town, OR 97205

      **Parking & transit** — Street parking after 6 p.m., steps from the Cedar Street MAX stop.
    form:
      type: FormBlock
      elementId: book-a-table
      fields:
        - name: firstName
          label: First name
          hideLabel: true
          placeholder: First name
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: lastName
          label: Last name
          hideLabel: true
          placeholder: Last name
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: email
          label: Email
          hideLabel: true
          placeholder: Email
          isRequired: true
          width: 1/2
          type: EmailFormControl
        - name: partySize
          label: Party size
          hideLabel: true
          placeholder: Party size
          isRequired: true
          width: 1/2
          type: TextFormControl
        - name: visitDate
          label: Preferred date
          hideLabel: true
          placeholder: Preferred date
          isRequired: false
          width: 1/2
          type: TextFormControl
        - name: phone
          label: Phone number
          hideLabel: true
          placeholder: Phone number
          isRequired: false
          width: 1/2
          type: TextFormControl
        - name: message
          label: Occasion or requests
          hideLabel: true
          placeholder: Tell us about your plans
          isRequired: false
          width: full
          type: TextareaFormControl
      submitLabel: Send reservation request
      styles:
        self:
          textAlign: left
    media:
      type: ImageBlock
      url: /images/contact.jpg
      altText: Bartender setting down cocktails and appetizers on the bar
    styles:
      self:
        width: wide
        padding:
          - pt-20
          - pb-24
          - pl-4
          - pr-4
        textAlign: left
        flexDirection: row
---
