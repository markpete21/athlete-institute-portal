# Athlete Institute — Facility & Registration Portal

## Module 17 of N: PHOTO & VIDEO GALLERY

> Staff upload **photos and video** to a program or session; galleries **auto-populate in each enrolled family's Play portal** based on their registrations. Families **browse and select-and-download** (single or zip). Built for **cost control** — thumbnail/poster browse, streamed video, CDN, lifecycle archiving. Reuses the existing Supabase Storage + video/CDN stack. Build after Module 4.

---

## Project Context

Same stack. Photos → Supabase Storage; **video reuses the existing live-stream/video infrastructure** (transcoding + HLS streaming), NOT raw MP4 from Storage. Visibility follows enrollment — no manual per-family sharing.

---

## Core Behavior

- **Staff upload** media to a **program or session** (Supabase Storage; video into the transcoding/streaming pipeline).
- **Auto-population:** because Play knows each family's enrollments, the relevant galleries **appear automatically** in the customer portal for the programs/sessions they're in. New upload → enrolled families notified (Module 0/13).
- **Browse:** **resized thumbnails (photos) and poster frames (video)** in the gallery view — never full-res originals or autoplay in browse.
- **Video playback:** **streamed, adaptive resolution** (reuse live-stream delivery).
- **Download:** explicit action — **full-res original only on download**; single or **multi-select → zip**.

---

## Cost Control (bake in)

- **Thumbnails/posters in browse**, full-res/original only on explicit download (~90% bandwidth cut).
- **CDN in front** (Supabase image transform/CDN or Cloudflare) — cached media doesn't re-hit egress.
- **Video via streaming pipeline** (HLS), not Storage egress of whole files.
- **Lifecycle archiving** — optionally lower-tier/archive galleries older than N months (download activity craters after a season).
- Expected scale: photos ~tens/month; video the larger line (low hundreds/month at heavy use), same bucket as the streaming product.

---

## Build Stages

1. **Upload + attach** — staff upload photos/video to program/session; photos→Storage, video→transcoding pipeline.
2. **Enrollment auto-population** — galleries surface in Play per family enrollment; new-upload notification.
3. **Browse + playback** — thumbnail/poster grid, streamed adaptive video, CDN-served.
4. **Select + download** — single + multi-select zip of full-res originals.
5. **Cost controls** — CDN wiring, lifecycle archive policy.

### Deliverables
- Source (`/app/gallery`, `/admin/gallery`, `/lib/gallery`), upload UI, streamed player, zip-download.
- README: enrollment-driven visibility, thumbnail/streaming approach, CDN + lifecycle config, cost notes.
- Tests: enrollment-based visibility (only enrolled families see a gallery), thumbnail served in browse / original on download, multi-select zip, video streams not raw-served.

### Non-Functional
- Mobile-first browse + download.
- Video reuses live-stream infra; never serve raw video from Storage.
- Visibility strictly enrollment-scoped.
