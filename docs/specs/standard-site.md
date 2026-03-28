# Standard.site Integration

Display long-form content for any handle using [standard.site](https://standard.site) lexicons.

## Lexicons

| Lexicon                            | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `site.standard.publication`        | Publication metadata: name, description, icon, base URL, theme |
| `site.standard.document`           | Individual document/post: title, content, metadata             |
| `site.standard.graph.subscription` | User subscriptions to publications                             |

## Feature: View Publications for a Handle

1. Given a handle, resolve DID
2. Query `com.atproto.repo.listRecords` for collection `site.standard.publication`
3. If found, display publication card (name, description, icon)
4. List documents via `site.standard.document` collection
    - Leaflet
    - PCKT
    - Offprint
    - Greengale
    - Bento
5. Render document content (markdown) in a reading view

## Feature: Subscribe to Publications

- Authenticated users can create `site.standard.graph.subscription` records
- Track subscriptions in sidebar alongside feed list

## Integration Points

- AT Explorer: when browsing a repo, highlight standard.site collections with a distinct icon
- Profile view: show "Publications" tab if the user has standard.site records
- Search: index document text alongside posts for FTS/semantic search

## UX Polish

- Publication cards: `Motion` scale-up on hover, spring easing
- Document list: staggered `Motion` fade-in
- Reading view: `Presence` slide-in from right (like turning a page)
- Subscribe/unsubscribe: `Motion` pop on the icon toggle
- Markdown content: smooth typography with comfortable reading width
