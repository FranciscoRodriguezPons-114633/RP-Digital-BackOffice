import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" updated="octubre de 2026">
      <p>
        Esta política explica qué datos personales trata RP Backoffice y cómo, en el marco de la Ley 25.326 de Protección
        de los Datos Personales.
      </p>
      <h2>1. Qué datos tratamos</h2>
      <p>
        Correo y nombre de quienes usan el servicio; los datos que el estudio carga (proyectos, horas, montos,
        archivos); y, al aprobar o rechazar una orden de cambio, el nombre escrito, la fecha, la dirección IP y el
        navegador.
      </p>
      <h2>2. Para qué</h2>
      <p>
        Para prestar el servicio, enviar los avisos que el estudio configura, dejar registro de las aprobaciones y
        facturar. No vendemos datos ni los usamos para publicidad.
      </p>
      <h2>3. Dónde se guardan</h2>
      <p>
        En proveedores de infraestructura en la nube (base de datos y archivos, envío de correos), que pueden estar
        fuera de Argentina, con medidas de seguridad acordes.
      </p>
      <h2>4. Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación o supresión de tus datos. La Agencia de Acceso a la Información Pública es el
        órgano de control de la Ley 25.326.
      </p>
      <h2>5. Conservación</h2>
      <p>
        Los datos se conservan mientras la cuenta esté activa y por el plazo necesario para cumplir obligaciones
        legales. El registro de aprobaciones se conserva como prueba de lo aprobado.
      </p>
    </LegalPage>
  );
}
