import type { Project } from '../types'
import { DAY, HOUR, minutesAgo } from './clock'

export const MOCK_PROJECTS: readonly Project[] = [
  {
    id: 'startup-app',
    name: 'Startup App',
    description: 'Full-stack application with authentication, billing, and dashboard features.',
    repositoryName: 'startup-app',
    branch: 'feature/google-auth',
    stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    lastActiveAgent: 'claude-code',
    currentTaskId: 'task-google-auth',
    updatedAt: minutesAgo(26),
  },
  {
    id: 'dev-portfolio',
    name: 'Developer Portfolio',
    description: 'Personal site with project case studies, a blog, and a contact form.',
    repositoryName: 'dev-portfolio',
    branch: 'feature/mdx-blog',
    stack: ['Next.js', 'TypeScript', 'MDX', 'Tailwind CSS'],
    lastActiveAgent: 'cursor',
    currentTaskId: 'task-mdx-blog',
    updatedAt: minutesAgo(3 * HOUR - 2),
  },
  {
    id: 'analytics-platform',
    name: 'Analytics Platform',
    description: 'Event ingestion pipeline and reporting dashboards for product metrics.',
    repositoryName: 'analytics-platform',
    branch: 'fix/ingest-retry',
    stack: ['Python', 'FastAPI', 'ClickHouse', 'React'],
    lastActiveAgent: 'codex',
    currentTaskId: 'task-ingest-retry',
    updatedAt: minutesAgo(22 * HOUR),
  },
  {
    id: 'docs-site',
    name: 'Docs Site',
    description: 'Product documentation built with Astro and Markdown.',
    repositoryName: 'docs-site',
    branch: 'main',
    stack: ['Astro', 'Markdown', 'TypeScript'],
    lastActiveAgent: 'chatgpt',
    updatedAt: minutesAgo(5 * DAY),
  },
]
