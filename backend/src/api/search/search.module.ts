import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SEARCH_PROVIDERS } from './interfaces/search-provider.interface';
import { TavilyProvider } from './providers/tavily.provider';
import {
  SearchExecution,
  SearchExecutionSchema,
} from './schemas/search-execution.schema';
import { SearchRouterService } from './services/search-router.service';
import { SearchHealthService } from './services/search-health.service';
import { SearchHealthController } from './controllers/search-health.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SearchExecution.name, schema: SearchExecutionSchema },
    ]),
  ],
  controllers: [SearchHealthController],
  providers: [
    TavilyProvider,
    {
      provide: SEARCH_PROVIDERS,
      inject: [TavilyProvider],
      useFactory: (tavily: TavilyProvider) => [tavily],
    },
    SearchRouterService,
    SearchHealthService,
  ],
  exports: [SearchRouterService, SearchHealthService, TavilyProvider],
})
export class SearchModule {}
