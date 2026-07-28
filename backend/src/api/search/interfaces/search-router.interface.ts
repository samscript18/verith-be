import type { Types } from 'mongoose';
import type {
  SearchRequest,
  SearchResultPage,
} from './search-provider.interface';

export interface RoutedSearchRequest extends SearchRequest {
  requestId: string;
  verificationId?: Types.ObjectId | string;
  claimId?: Types.ObjectId | string;
}

export type RoutedSearchResult = SearchResultPage;
