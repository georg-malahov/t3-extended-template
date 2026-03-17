"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useClientQueries } from "@zenstackhq/tanstack-query/react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectGetPayload } from "@/lib/zenstack/generated/input";
import { schema } from "@/lib/zenstack/generated/schema-lite";

const projectSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(280).optional(),
});

type ProjectValues = z.infer<typeof projectSchema>;

type ProjectRow = ProjectGetPayload<{ include: { creator: true } }>;

export function ProjectsView({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const client = useClientQueries(schema);
  const form = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const projectsQuery = client.project.useFindMany({
    where: { organizationId },
    include: { creator: true },
    orderBy: { createdAt: "desc" },
  });

  const createProject = client.project.useCreate();
  const updateProject = client.project.useUpdate();
  const deleteProject = client.project.useDelete();

  const columns = useMemo<ColumnDef<ProjectRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Project",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-sm text-muted-foreground">
              {row.original.description || "No description"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
      },
      {
        accessorKey: "creator",
        header: "Created by",
        cell: ({ row }) => row.original.creator?.name || row.original.creator?.email || "Unknown",
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) =>
          new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(row.original.updatedAt)),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const nextStatus =
            row.original.status === "ACTIVE" ? "PAUSED" : "ACTIVE";

          return (
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  updateProject.mutate(
                    {
                      where: { id: row.original.id },
                      data: { status: nextStatus },
                    },
                    {
                      onSuccess: () => toast.success("Project updated."),
                      onError: (error) =>
                        toast.error(error instanceof Error ? error.message : "Unable to update project."),
                    },
                  )
                }
                size="sm"
                variant="outline"
              >
                {row.original.status === "ACTIVE" ? "Pause" : "Activate"}
              </Button>
              <Button
                onClick={() =>
                  deleteProject.mutate(
                    { where: { id: row.original.id } },
                    {
                      onSuccess: () => toast.success("Project deleted."),
                      onError: (error) =>
                        toast.error(error instanceof Error ? error.message : "Unable to delete project."),
                    },
                  )
                }
                size="sm"
                variant="ghost"
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [deleteProject, updateProject],
  );

  const onSubmit = form.handleSubmit((values) => {
    createProject.mutate(
      {
        data: {
          name: values.name,
          description: values.description || null,
          organizationId,
          creatorId: userId,
        },
      },
      {
        onSuccess: () => {
          toast.success("Project created.");
          form.reset();
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Unable to create project."),
      },
    );
  });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Create project</CardTitle>
          <CardDescription>
            Starter CRUD flow powered by ZenStack RPC and TanStack Query.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" {...form.register("name")} />
              {form.formState.errors.name ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                className="min-h-10"
                id="project-description"
                {...form.register("description")}
              />
              {form.formState.errors.description ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.description.message}
                </p>
              ) : null}
            </div>
            <div className="flex items-end">
              <Button disabled={createProject.isPending} type="submit">
                {createProject.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>
            CRUD reads are fully typed from the same schema that defines your API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={projectsQuery.data ?? []}
            emptyMessage={
              projectsQuery.isPending ? "Loading projects..." : "Create your first project."
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
