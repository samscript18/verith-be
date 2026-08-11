import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { DailyChallengeConfig } from '../../../shared/config';
import type { GeneratedDailyChallenge } from '../interfaces/daily-challenge.interface';
import { Challenge } from '../schemas/challenge.schema';
import {
  questionSignature,
  questionSimilarity,
} from '../utils/question-similarity';
import { DailyChallengeContentError } from './daily-challenge-validator.service';

@Injectable()
export class DailyChallengeDuplicateService {
  private readonly config: DailyChallengeConfig;

  constructor(
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
    configService: ConfigService,
  ) {
    this.config =
      configService.getOrThrow<DailyChallengeConfig>('dailyChallenge');
  }

  async assertFresh(
    challenge: GeneratedDailyChallenge,
    now: Date,
  ): Promise<void> {
    const since = new Date(
      now.getTime() - this.config.duplicateWindowDays * 86_400_000,
    );
    const recent = await this.challenges
      .find({
        slug: /^daily-media-literacy-/,
        publishAt: { $gte: since, $lt: now },
      })
      .select('questions.prompt questions.normalizedSignature')
      .lean()
      .exec();
    const previous = recent.flatMap((item) => item.questions ?? []);
    const signatures = new Set(
      previous.map(
        (item) => item.normalizedSignature ?? questionSignature(item.prompt),
      ),
    );
    for (const question of challenge.questions) {
      if (signatures.has(questionSignature(question.prompt)))
        throw new DailyChallengeContentError(
          'RECENT_EXACT_DUPLICATE',
          'A generated question repeats recent Daily Practice content',
        );
      if (
        previous.some(
          (item) =>
            questionSimilarity(question.prompt, item.prompt) >=
            this.config.similarityThreshold,
        )
      )
        throw new DailyChallengeContentError(
          'RECENT_SIMILAR_QUESTION',
          'A generated question is materially similar to recent Daily Practice content',
        );
    }
  }
}
