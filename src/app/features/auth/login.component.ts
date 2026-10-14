import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EMPTY, catchError, finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly credentialsInvalid = signal(false);
  readonly logoDots = Array.from({ length: 84 }, (_, index) => index);
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  submit(): void {
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.credentialsInvalid.set(true);
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los datos e inténtalo de nuevo.');
      return;
    }

    this.submitting.set(true);
    this.auth
      .login(this.form.getRawValue())
      .pipe(
        catchError((error: unknown) => {
          this.credentialsInvalid.set(
            error instanceof HttpErrorResponse && error.status === 401
          );
          this.errorMessage.set(
            error instanceof HttpErrorResponse && error.status === 401
              ? 'El correo o la contraseña no son correctos.'
              : error instanceof HttpErrorResponse && error.status === 429
                ? 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
                : 'No pudimos iniciar sesión. Comprueba tu conexión e inténtalo de nuevo.'
          );
          return EMPTY;
        }),
        finalize(() => this.submitting.set(false))
      )
      .subscribe(() => void this.router.navigateByUrl('/app/dashboard'));
  }

  clearCredentialError(): void {
    this.credentialsInvalid.set(false);
    this.errorMessage.set('');
  }
}
