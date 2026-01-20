import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT')!;

  app.enableCors({
    origin: [
      config.get<string>('VITE_APP_URL')!,
      config.get<string>('VITE_ADMIN_APP_URL')!,
    ],
    credentials: true,
  });

  await app.listen(port);
}
bootstrap();
