# CLAUDE.md — max-mcp-server

## Le dépôt
- Serveur MCP (Streamable HTTP) qui expose l'API Max Agent de Digital Crew sous forme d'outils MCP. Routes : `app/mcp/route.ts` (MCP, SSE désactivé), `app/chat/route.ts`, `app/health/route.ts`.
- Stack : Next.js 15 (App Router, `output: "standalone"`), `mcp-handler`, Zod 3, TypeScript strict, Vitest. Alias d'import `@/*` vers la racine.
- Gestionnaire : pnpm 8.15.7, épinglé par `packageManager` (lockfile v6). N'utilise ni npm ni une autre version de pnpm pour modifier `pnpm-lock.yaml`.
- Node : ni `.nvmrc` ni `engines`. La CI tourne en Node 20.
- Déploiement : intégration Git de Vercel (préversion sur PR, production au merge sur main). La CI ne fait que bloquer.

## Commandes (package.json)
- Installation : `pnpm install` (la CI lance `pnpm install --frozen-lockfile`).
- Dev : `pnpm dev`. Lint : `pnpm lint`. Typecheck : `pnpm type-check` (pas de script `typecheck`).
- Tests : `pnpm test` (vitest run), `pnpm test:watch`.
- Inventaire des outils : `pnpm docs:check` (vérifie), `pnpm docs:tools` (régénère).
- Build : `pnpm build` (le `postbuild` lance `scripts/copy-standalone-assets.mjs`).
- Taille du catalogue et vérification du plafond : `pnpm catalog:measure`.
- Pas de script `test:security` ni de script de formatage.
- Ordre de la CI (`.github/workflows/ci.yml`) : lint, type-check, test, docs:check, build, présence de `.next/standalone/server.js`, `pnpm audit` (indicatif seulement).
- `pnpm verify` et `pnpm test:endpoints` demandent un serveur lancé. `verify` sans jeton porteur liste les outils mais saute les appels réels ; `test:endpoints` exige un jeton, crée et supprime de vraies ressources : ne le lance pas sans accord humain.

## Structure
- `app/` : routes Next.js (`mcp`, `chat`, `health`).
- `middleware.ts` (+ `middleware.test.ts`) : passerelle d'authentification devant `/mcp` et `/chat`.
- `features/pilot-tools/<domaine>/` : un domaine par dossier, en général `tools.ts` (enregistrement), `schema.ts` (Zod), `repository.ts` (appels API), `tools.test.ts`.
- `features/pilot-tools/mcp/register.ts` : point d'entrée de l'enregistrement et liste `GROUPS` (un outil groupé par domaine).
- `features/pilot-tools/shared.ts`, `http.ts`, `circuit-breaker.ts`, `dead-letter.ts` : client HTTP, reprises, disjoncteur, file des échecs.
- `features/workspace-profile/` : outils du profil de workspace.
- `shared/auth/`, `shared/http/` : clés API Max, portée de la passerelle, client Digital Crew, limite de débit du chat.
- `test/contract/` : tests de contrat (inventaire, plafond du catalogue, schémas publiés).
- `docs/` : `tools.json` (généré), référence des outils, ADR dans `docs/adr/`. `scripts/` : générateur de docs et scripts de test manuels.

## Règles
- Ajout, renommage ou suppression d'un outil : lance `pnpm docs:tools` et commite `docs/tools.json` et le tableau du README (entre `<!-- TOOLS:START -->` et `<!-- TOOLS:END -->`). Ne modifie pas ces deux sorties à la main : `docs:check` fait échouer la CI en cas d'écart.
- Le mode groupé est le défaut (`GROUPED_TOOLS` absent). Un nom d'outil groupé ne doit pas contenir de `_`. Le catalogue par défaut doit tenir dans 122 outils (`MCP_TOOL_BUDGET`, `features/pilot-tools/mcp/client-cap.ts`). `test/contract/tool-inventory.test.ts` le vérifie. Voir ADR-006.
- Les schémas d'entrée doivent rester visibles une fois publiés par le SDK MCP (`test/contract/published-schema.test.ts`). Après un changement de schéma, vérifie que ce test passe.
- Outils sensibles derrière un drapeau, désactivés par défaut : achats (`ENABLE_PURCHASE_TOOLS`), admin (`ENABLE_ADMIN_TOOLS`), simulateurs de webhooks (`ENABLE_WEBHOOK_SIMULATORS`). Ne retire pas ces garde-fous et ne les active pas par défaut.
- Authentification : jeton porteur par requête. Le repli sur un jeton d'environnement n'est actif que si `ALLOW_ENV_TOKEN_FALLBACK=true` (ADR-002). N'en fais pas un défaut.
- `.env.example` : noms de variables et valeurs vides ou factices uniquement. Jamais de vrai secret ni d'URL de production en dur dans le code.
- Ajoute ou adapte les tests (`*.test.ts` à côté du code) avec chaque changement.
- Pas de migrations ni de dossier i18n dans ce dépôt.

## Flux Git
- Branche `claude/<clé-de-la-carte>-<mot-clé>`, créée depuis `main`. PR vers `main` (branche par défaut), avec relecture humaine.
- Jamais de push sur `main` ni sur `develop`, jamais de merge, jamais de force-push.
- Avant de pousser : `pnpm lint`, `pnpm type-check`, `pnpm test` et `pnpm docs:check` (ce que lance la CI).
