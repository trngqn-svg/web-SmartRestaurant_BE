import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const config = app.get(ConfigService);
  const origin = config.get<string>('VITE_APP_URL')!;
  const port = config.get<number>('PORT')!;

  app.enableCors({
    origin: [origin],
    credentials: true,
  });

  await app.listen(port);
}
bootstrap();
