---
type: ProjectLayout
title: Marley1
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/marley1.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 75
date: '2026-09-21'
client: ''
description: >-
  My home AI lab on small edge hardware: local language models on a Jetson Orin
  Nano and Raspberry Pi 5, and an overnight analyst that reviews project
  schedules and earned value without the data leaving the building.
featuredImage:
  type: ImageBlock
  url: /images/marley1.jpg
  altText: Marley1
media:
  type: ImageBlock
  url: /images/marley1.jpg
  altText: Marley1
---

Marley1 is a small mesh of edge computers I use to find out how much useful AI fits on cheap, local hardware. The main node is an NVIDIA Jetson Orin Nano with 8 GB of memory and an NVMe drive, alongside a Raspberry Pi 5.

**Big models on a small board.** A 30B-parameter mixture-of-experts model does not fit in 8 GB, so I streamed it from the SSD and measured every lever: quantization level, power mode, speculative decoding, KV-cache settings, GPU offload and expert prefetch. Some worked, several were dead ends, and every result was benchmarked before it was kept. The model running today is a pruned 15B mixture-of-experts at about 5 tokens per second.

**First real job: an overnight analyst.** Drop a P6 export or an earned value file in a folder and a report is waiting in the morning. Python computes every number; the model only writes the narrative, and any figure it cannot verify is flagged. Confidential project data never leaves the box.

**Quality gate.** Every model is scored against the same 48-prompt test of tool use, schedule and cost interpretation before it gets a job. Arithmetic always goes through a calculator tool, because no small model passes that part reliably.
