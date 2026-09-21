import { IsBoolean } from 'class-validator';
import type { UpdateAutomationConfigInput } from '@impact-flow/contracts';

export class UpdateAutomationConfigDto
  implements UpdateAutomationConfigInput
{
  @IsBoolean()
  autoInspectionEnabled!: boolean;

  @IsBoolean()
  autoChangeAnalysisEnabled!: boolean;

  @IsBoolean()
  autoAiAnalysisEnabled!: boolean;
}
