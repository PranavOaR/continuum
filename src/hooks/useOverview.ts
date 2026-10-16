import { useMemo } from 'react'
import { getAgent } from '../data/agents'
import { continuumService, type AttentionItem, type OverviewData } from '../services'
import { useHandoffs } from '../state/handoffs'
import { useServiceQuery, type QueryState } from './useServiceQuery'

export function useOverviewQuery(): QueryState<OverviewData> {
  return useServiceQuery('overview', () => continuumService.getOverview())
}

/** Service-derived attention items plus draft handoffs awaiting review (client state). */
export function useAttentionItems(): { items: AttentionItem[]; isLoading: boolean } {
  const { data, isLoading } = useOverviewQuery()
  const { handoffs } = useHandoffs()

  const items = useMemo(() => {
    if (!data) return []
    const projectName = (id: string) => data.projects.find((summary) => summary.project.id === id)?.project.name ?? id
    const handoffItems: AttentionItem[] = handoffs
      .filter((handoff) => handoff.status === 'draft')
      .map((handoff) => ({
        id: `attn-handoff-${handoff.id}`,
        kind: 'handoff-review',
        title: 'Handoff draft needs review',
        description: `${projectName(handoff.projectId)} · ${getAgent(handoff.sourceAgent).name} → ${getAgent(handoff.targetAgent).name}`,
        projectId: handoff.projectId,
        to: `/app/handoffs/${handoff.id}`,
      }))
    return [...data.attention, ...handoffItems]
  }, [data, handoffs])

  return { items, isLoading }
}
