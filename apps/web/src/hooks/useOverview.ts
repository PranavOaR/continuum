import { continuumService, type AttentionItem, type OverviewData } from '../services'
import { useServiceQuery, type QueryState } from './useServiceQuery'

export function useOverviewQuery(): QueryState<OverviewData> {
  return useServiceQuery('overview', () => continuumService.getOverview())
}

export function useAttentionItems(): { items: AttentionItem[]; isLoading: boolean } {
  const { data, isLoading } = useOverviewQuery()
  return { items: data?.attention ?? [], isLoading }
}
