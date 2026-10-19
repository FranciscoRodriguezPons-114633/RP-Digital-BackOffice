import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function TermsPage() {
  return (
    <LegalPage title="Términos y condiciones" updated="octubre de 2026">
      <p>
        Estos términos regulan el uso de RP Backoffice (el «servicio») por parte de los estudios que contratan una cuenta
        (el «estudio») y de las personas que el estudio invita (clientes, renderistas, contratistas).
      </p>
      <h2>1. El servicio</h2>
      <p>
        Es una herramienta para registrar honorarios, horas, órdenes de cambio, revisiones de planos, envíos y
        comentarios. No reemplaza el asesoramiento profesional, contable ni legal.
      </p>
      <h2>2. Cuentas, prueba y pago</h2>
      <p>
        Cada estudio tiene {TRIAL_DAYS} días de prueba sin costo. Para seguir, elige un plan y paga por transferencia contra
        factura, mensual o anual. Si al terminar la prueba no elige un plan, se le avisa y sus datos se conservan por un
        plazo razonable para que los pueda exportar.
      </p>
      <h2>3. Aprobaciones por link</h2>
      <p>
        La aprobación de una orden de cambio deja registrado el nombre que escribe quien aprueba, el correo al que se
        envió el link, la fecha, la dirección IP y la huella del contenido aprobado. No es una firma digital en los
        términos de la Ley 25.506.
      </p>
      <h2>4. Datos del estudio</h2>
      <p>
        Los datos y archivos que el estudio carga son del estudio. El servicio los trata solo para prestar el servicio,
        según la Política de privacidad.
      </p>
      <h2>5. Responsabilidad</h2>
      <p>
        El servicio se presta con diligencia, pero sin garantía de funcionamiento ininterrumpido. El estudio es
        responsable del contenido que carga y de a quién lo comparte.
      </p>
      <h2>6. Cambios y contacto</h2>
      <p>Los cambios a estos términos se avisan por correo con 30 días de anticipación.</p>
    </LegalPage>
  );
}
