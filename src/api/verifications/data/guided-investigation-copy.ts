import { SupportedLanguage } from '../../../shared/language/supported-language';
import {
  GuidedQuestionCode,
  GuidedQuestionType,
  MediaLiteracyCompetency,
} from '../enums/guided-investigation.enum';

interface LocalizedQuestionCopy {
  prompt: string;
  helperText: string;
  options: Record<string, string>;
}

interface GuidedQuestionDefinition {
  code: GuidedQuestionCode;
  type: GuidedQuestionType;
  competency: MediaLiteracyCompetency;
  objectivelyScorable: boolean;
  correctOptionIds: string[];
  optionIds: string[];
  translations: Record<SupportedLanguage, LocalizedQuestionCopy>;
}

export const GUIDED_QUESTION_DEFINITIONS: GuidedQuestionDefinition[] = [
  {
    code: GuidedQuestionCode.RESPONSIBLE_SHARING,
    type: GuidedQuestionType.SINGLE_SELECT,
    competency: MediaLiteracyCompetency.RESPONSIBLE_SHARING,
    objectivelyScorable: true,
    correctOptionIds: ['WAIT_AND_CHECK'],
    optionIds: ['SHARE_NOW', 'WAIT_AND_CHECK', 'TRUST_POPULARITY'],
    translations: {
      en: {
        prompt:
          'Before you share or act on this content, what is the safest next step?',
        helperText:
          'Choose the action that protects you and other people while the claim is still being checked.',
        options: {
          SHARE_NOW: 'Share it now because it may be urgent',
          WAIT_AND_CHECK: 'Pause and check the claim against reliable evidence',
          TRUST_POPULARITY: 'Trust it if many people have reposted it',
        },
      },
      fr: {
        prompt:
          'Avant de partager ce contenu ou d’agir, quelle est l’étape suivante la plus sûre ?',
        helperText:
          'Choisissez l’action qui vous protège, ainsi que les autres, pendant la vérification de l’affirmation.',
        options: {
          SHARE_NOW: 'Le partager immédiatement parce que cela semble urgent',
          WAIT_AND_CHECK:
            'Attendre et vérifier l’affirmation à l’aide de preuves fiables',
          TRUST_POPULARITY:
            'Le croire parce que beaucoup de personnes l’ont repartagé',
        },
      },
      es: {
        prompt:
          'Antes de compartir este contenido o actuar, ¿cuál es el siguiente paso más seguro?',
        helperText:
          'Elige la acción que te protege a ti y a otras personas mientras se verifica la afirmación.',
        options: {
          SHARE_NOW: 'Compartirlo ahora porque podría ser urgente',
          WAIT_AND_CHECK:
            'Pausar y comprobar la afirmación con pruebas fiables',
          TRUST_POPULARITY:
            'Confiar porque muchas personas lo han vuelto a publicar',
        },
      },
      yo: {
        prompt:
          'Kí ni ìgbésẹ̀ tó dájú jù lọ kí o tó pín àkóónú yìí tàbí kí o ṣe ohun kan lórí rẹ̀?',
        helperText:
          'Yan ìgbésẹ̀ tó máa dáàbò bo ìwọ àti àwọn ẹlòmíràn nígbà tí a ṣì ń yẹ ẹ̀sùn náà wò.',
        options: {
          SHARE_NOW: 'Pín in nísinsìnyí nítorí ó lè jẹ́ pàjáwìrì',
          WAIT_AND_CHECK: 'Dúró, kí o sì fi ẹ̀rí tó ṣeé gbẹ́kẹ̀lé yẹ ẹ̀sùn náà wò',
          TRUST_POPULARITY: 'Gbà á gbọ́ nítorí ọ̀pọ̀ ènìyàn ti tún un pín',
        },
      },
    },
  },
  {
    code: GuidedQuestionCode.SOURCE_STRENGTH,
    type: GuidedQuestionType.MULTIPLE_SELECT,
    competency: MediaLiteracyCompetency.EVIDENCE_EVALUATION,
    objectivelyScorable: true,
    correctOptionIds: [
      'ORIGINAL_SOURCE',
      'DATE_AND_CONTEXT',
      'INDEPENDENT_CONFIRMATION',
    ],
    optionIds: [
      'ORIGINAL_SOURCE',
      'DATE_AND_CONTEXT',
      'INDEPENDENT_CONFIRMATION',
      'POPULARITY',
    ],
    translations: {
      en: {
        prompt: 'Which details would make the evidence stronger?',
        helperText: 'Choose every useful check.',
        options: {
          ORIGINAL_SOURCE: 'The original source, not only a repost',
          DATE_AND_CONTEXT: 'The date and full context',
          INDEPENDENT_CONFIRMATION:
            'Independent sources confirming the same facts',
          POPULARITY: 'A large number of likes or forwards',
        },
      },
      fr: {
        prompt: 'Quels éléments rendraient les preuves plus solides ?',
        helperText: 'Choisissez toutes les vérifications utiles.',
        options: {
          ORIGINAL_SOURCE:
            'La source originale, et pas seulement une republication',
          DATE_AND_CONTEXT: 'La date et le contexte complet',
          INDEPENDENT_CONFIRMATION:
            'Des sources indépendantes confirmant les mêmes faits',
          POPULARITY: 'Un grand nombre de mentions J’aime ou de transferts',
        },
      },
      es: {
        prompt: '¿Qué detalles harían que las pruebas fueran más sólidas?',
        helperText: 'Elige todas las comprobaciones útiles.',
        options: {
          ORIGINAL_SOURCE: 'La fuente original, no solo una republicación',
          DATE_AND_CONTEXT: 'La fecha y el contexto completo',
          INDEPENDENT_CONFIRMATION:
            'Fuentes independientes que confirmen los mismos hechos',
          POPULARITY: 'Un gran número de «me gusta» o reenvíos',
        },
      },
      yo: {
        prompt: 'Àwọn àlàyé wo ni yóò mú kí ẹ̀rí náà lágbára sí i?',
        helperText: 'Yan gbogbo àyẹ̀wò tó wúlò.',
        options: {
          ORIGINAL_SOURCE: 'Orísun àkọ́kọ́, kì í ṣe àtúnpín nìkan',
          DATE_AND_CONTEXT: 'Ọjọ́ àti gbogbo àyíká ọ̀rọ̀ náà',
          INDEPENDENT_CONFIRMATION:
            'Àwọn orísun olómìnira tó fìdí òtítọ́ kan náà múlẹ̀',
          POPULARITY: 'Ọ̀pọ̀ ìfẹ́ tàbí àtúnfiranṣẹ́',
        },
      },
    },
  },
  {
    code: GuidedQuestionCode.MISSING_CONTEXT,
    type: GuidedQuestionType.SHORT_TEXT,
    competency: MediaLiteracyCompetency.CONTEXT_RECOGNITION,
    objectivelyScorable: false,
    correctOptionIds: [],
    optionIds: [],
    translations: {
      en: {
        prompt:
          'What date, place, source, comparison, or other context might be missing?',
        helperText: 'Write what you notice in your own words.',
        options: {},
      },
      fr: {
        prompt:
          'Quelle date, quel lieu, quelle source, quelle comparaison ou quel autre contexte pourrait manquer ?',
        helperText: 'Écrivez ce que vous remarquez avec vos propres mots.',
        options: {},
      },
      es: {
        prompt:
          '¿Qué fecha, lugar, fuente, comparación u otro contexto podría faltar?',
        helperText: 'Escribe lo que observas con tus propias palabras.',
        options: {},
      },
      yo: {
        prompt:
          'Ọjọ́, ibi, orísun, ìfiwéra tàbí àyíká ọ̀rọ̀ míì wo ni ó ṣeé ṣe kí ó má sí?',
        helperText: 'Kọ ohun tí o ṣàkíyèsí ní ọ̀rọ̀ tìrẹ.',
        options: {},
      },
    },
  },
  {
    code: GuidedQuestionCode.PROVISIONAL_VERDICT,
    type: GuidedQuestionType.PROVISIONAL_VERDICT,
    competency: MediaLiteracyCompetency.EVIDENCE_EVALUATION,
    objectivelyScorable: false,
    correctOptionIds: [],
    optionIds: ['SUPPORTED', 'CONTRADICTED', 'MIXED', 'INSUFFICIENT_EVIDENCE'],
    translations: {
      en: {
        prompt:
          'Before seeing Verith’s evidence, what is your provisional view?',
        helperText: 'This first impression is not scored as right or wrong.',
        options: {
          SUPPORTED: 'Likely supported',
          CONTRADICTED: 'Likely contradicted',
          MIXED: 'Mixed or missing important context',
          INSUFFICIENT_EVIDENCE: 'Not enough evidence yet',
        },
      },
      fr: {
        prompt:
          'Avant de voir les preuves de Verith, quel est votre avis provisoire ?',
        helperText:
          'Cette première impression n’est pas notée comme vraie ou fausse.',
        options: {
          SUPPORTED: 'Probablement étayée',
          CONTRADICTED: 'Probablement contredite',
          MIXED: 'Mitigée ou contexte important manquant',
          INSUFFICIENT_EVIDENCE: 'Pas encore assez de preuves',
        },
      },
      es: {
        prompt:
          'Antes de ver las pruebas de Verith, ¿cuál es tu opinión provisional?',
        helperText:
          'Esta primera impresión no se califica como correcta o incorrecta.',
        options: {
          SUPPORTED: 'Probablemente respaldada',
          CONTRADICTED: 'Probablemente contradicha',
          MIXED: 'Mixta o con contexto importante ausente',
          INSUFFICIENT_EVIDENCE: 'Aún no hay pruebas suficientes',
        },
      },
      yo: {
        prompt: 'Kí o tó rí ẹ̀rí Verith, kí ni èrò àkọ́kọ́ rẹ?',
        helperText: 'A kò ní fi èrò àkọ́kọ́ yìí ṣe ìdájọ́ pé ó tọ́ tàbí pé kò tọ́.',
        options: {
          SUPPORTED: 'Ó ṣeé ṣe kí ẹ̀rí ti lẹ́yìn rẹ̀',
          CONTRADICTED: 'Ó ṣeé ṣe kí ẹ̀rí tako rẹ̀',
          MIXED: 'Ẹ̀rí dàpọ̀ tàbí àyíká ọ̀rọ̀ pàtàkì kò sí',
          INSUFFICIENT_EVIDENCE: 'Ẹ̀rí kò tíì tó',
        },
      },
    },
  },
];

export const guidedQuestionCopy = (
  language: SupportedLanguage,
  code: GuidedQuestionCode,
) =>
  GUIDED_QUESTION_DEFINITIONS.find((item) => item.code === code)!.translations[
    language
  ];
