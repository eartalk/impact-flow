import { IsIn } from 'class-validator';
import type { UpdateRegressionFeedbackInput } from '@impact-flow/contracts';

export class UpdateRegressionFeedbackDto implements UpdateRegressionFeedbackInput {
  @IsIn(['CONFIRMED', 'EXCLUDED', 'PENDING'])
  decision!: UpdateRegressionFeedbackInput['decision'];
}
