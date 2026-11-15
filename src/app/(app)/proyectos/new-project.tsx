"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ProjectForm } from "../forms";

// «Nuevo proyecto» abre un panel con el formulario; al crear, la acción lleva al proyecto.
export function NewProjectButton({ isOwner, projects }: { isOwner: boolean; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus aria-hidden="true" size={16} />
        Nuevo proyecto
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo proyecto" eyebrow="Proyectos">
        <ProjectForm isOwner={isOwner} projects={projects} />
      </Sheet>
    </>
  );
}
