import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AiConfigsService } from './ai-configs.service';
import { CreateAiConfigDto } from './dto/create-ai-config.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';

@Controller('ai-configs')
export class AiConfigsController {
  constructor(private readonly configs: AiConfigsService) {}

  @Get()
  list() {
    return this.configs.list();
  }

  @Post()
  create(@Body() input: CreateAiConfigDto) {
    return this.configs.create(input);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdateAiConfigDto) {
    return this.configs.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.configs.remove(id);
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.configs.test(id);
  }
}
