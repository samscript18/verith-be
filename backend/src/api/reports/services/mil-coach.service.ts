import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotFoundException } from '../../../core/exceptions';
import { ChallengeStatus } from '../../challenges/enums/challenge.enum';
import { Challenge } from '../../challenges/schemas/challenge.schema';
import { CourseStatus, LessonStatus } from '../../learning/enums/learning.enum';
import { Course } from '../../learning/schemas/course.schema';
import { Lesson } from '../../learning/schemas/lesson.schema';
import { Verification } from '../../verifications/schemas/verification.schema';
import { MIL_COACH_TEMPLATES } from '../data/mil-coach-templates';
import { MilFindingTaxonomy } from '../enums/mil-finding-taxonomy.enum';
import { Report } from '../schemas/report.schema';

@Injectable()
export class MilCoachService {
  constructor(
    @InjectModel(Report.name) private readonly reports: Model<Report>,
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
    @InjectModel(Lesson.name) private readonly lessons: Model<Lesson>,
    @InjectModel(Course.name) private readonly courses: Model<Course>,
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
  ) {}

  async forReport(
    userId: string,
    reportId: string,
  ): Promise<Record<string, unknown>> {
    const report = await this.reports.findById(reportId).lean().exec();
    if (!report) throw this.notFound();
    const owned = await this.verifications.exists({
      _id: report.verificationId,
      userId: new Types.ObjectId(userId),
    });
    if (!owned) throw this.notFound();

    const finding = this.primaryFinding(report);
    const template = MIL_COACH_TEMPLATES[finding.taxonomy];
    const [lesson, challenge] = await Promise.all([
      this.lessons
        .findOne({
          status: LessonStatus.PUBLISHED,
          tags: { $in: template.tags },
        })
        .sort({ publishedAt: -1 })
        .select('courseId title slug summary estimatedDuration tags')
        .lean()
        .exec(),
      this.challenges
        .findOne({
          status: ChallengeStatus.PUBLISHED,
          publishAt: { $lte: new Date() },
          expiresAt: { $gt: new Date() },
          tags: { $in: template.tags },
        })
        .sort({ publishAt: -1 })
        .select('title slug scenario difficulty tags expiresAt')
        .lean()
        .exec(),
    ]);
    const course = lesson
      ? await this.courses
          .findOne({ _id: lesson.courseId, status: CourseStatus.PUBLISHED })
          .select('title slug')
          .lean()
          .exec()
      : null;

    return {
      taxonomy: finding.taxonomy,
      competency: template.competency,
      skillFocus: template.skillFocus,
      whatHappened: finding.whatHappened,
      whyItMatters: template.whyItMatters,
      nextCheck: template.nextCheck,
      practiceQuestion: template.practiceQuestion,
      relatedLesson:
        lesson && course
          ? {
              id: lesson._id.toString(),
              title: lesson.title,
              slug: lesson.slug,
              summary: lesson.summary,
              estimatedDuration: lesson.estimatedDuration,
              course: { title: course.title, slug: course.slug },
            }
          : null,
      relatedChallenge: challenge
        ? {
            id: challenge._id.toString(),
            title: challenge.title,
            slug: challenge.slug,
            scenario: challenge.scenario,
            difficulty: challenge.difficulty,
            expiresAt: challenge.expiresAt,
          }
        : null,
      generatedFrom: {
        reportId,
        reportVersion: report.version,
        templateVersion: 'mil-coach.v1',
        adaptedByAi: false,
      },
    };
  }

  private primaryFinding(report: Report): {
    taxonomy: MilFindingTaxonomy;
    whatHappened: string;
  } {
    const manipulation = report.manipulationAnalysis[0];
    const manipulationCategory = this.stringField(manipulation, 'category');
    if (
      manipulationCategory &&
      Object.values(MilFindingTaxonomy).includes(
        manipulationCategory as MilFindingTaxonomy,
      )
    ) {
      return {
        taxonomy: manipulationCategory as MilFindingTaxonomy,
        whatHappened: `The report retained a ${this.label(manipulationCategory)} signal in the submitted material.`,
      };
    }
    const context = report.missingContext[0];
    const contextType = this.stringField(context, 'type');
    const contextTaxonomy = this.contextTaxonomy(contextType);
    if (contextTaxonomy) {
      const detail = this.stringField(context, 'omittedContext');
      return {
        taxonomy: contextTaxonomy,
        whatHappened: detail
          ? `The report identified this missing context: ${detail}`
          : `The report retained a ${this.label(contextType)} finding.`,
      };
    }
    if (report.aiIndicators) {
      return {
        taxonomy: MilFindingTaxonomy.AI_MEDIA_UNCERTAINTY,
        whatHappened:
          'The report includes model-assisted media indicators with explicit limitations; those indicators are not proof of authenticity or origin.',
      };
    }
    if (report.audioAnalysis) {
      return {
        taxonomy: MilFindingTaxonomy.AUDIO_UNCERTAINTY,
        whatHappened:
          'The report preserved an audio analysis or transcript, which can clarify the words but not prove the speaker or recording context.',
      };
    }
    const duplicateEvidence = report.evidence.some(
      (item) => this.stringField(item, 'lineageType') === 'DUPLICATE',
    );
    if (duplicateEvidence) {
      return {
        taxonomy: MilFindingTaxonomy.LACK_OF_INDEPENDENT_EVIDENCE,
        whatHappened:
          'At least one retained source shares duplicate lineage, so repeated coverage should not be counted as independent confirmation.',
      };
    }
    return {
      taxonomy: MilFindingTaxonomy.EVIDENCE_EVALUATION,
      whatHappened: `The completed report reached a ${this.label(report.overallVerdict)} finding with ${Math.round(report.confidence * 100)}% recorded confidence and ${report.limitations.length} explicit ${report.limitations.length === 1 ? 'limitation' : 'limitations'}.`,
    };
  }

  private contextTaxonomy(value?: string): MilFindingTaxonomy | null {
    const map: Record<string, MilFindingTaxonomy> = {
      DATE_OMITTED: MilFindingTaxonomy.MISSING_DATE,
      LOCATION_OMITTED: MilFindingTaxonomy.MISSING_LOCATION,
      STATISTIC_WITHOUT_BASELINE: MilFindingTaxonomy.MISSING_BASELINE,
      STATISTIC_WITHOUT_SAMPLE_SIZE: MilFindingTaxonomy.UNSUPPORTED_STATISTICS,
      QUOTE_TRUNCATED: MilFindingTaxonomy.QUOTE_TRUNCATION,
      OLD_CONTENT_PRESENTED_AS_CURRENT:
        MilFindingTaxonomy.OLD_CONTENT_PRESENTED_AS_CURRENT,
      ORIGINAL_CAPTION_REMOVED: MilFindingTaxonomy.SCREENSHOT_CONTEXT_LOSS,
      SOURCE_OMITTED: MilFindingTaxonomy.SOURCE_IMPERSONATION,
    };
    return value ? (map[value] ?? null) : null;
  }

  private stringField(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object' || !(key in value))
      return undefined;
    const field = value[key as keyof typeof value];
    return typeof field === 'string' ? field : undefined;
  }

  private label(value: unknown): string {
    return typeof value === 'string'
      ? value.toLowerCase().replaceAll('_', ' ')
      : 'recorded';
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      'The report could not be found',
      'REPORT_NOT_FOUND',
    );
  }
}
