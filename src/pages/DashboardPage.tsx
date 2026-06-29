import { Link } from 'react-router-dom'
import { Map, Plus, FolderOpen, Layers, MessageSquare, BarChart3 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { useAuth } from '@/hooks/useAuth'
import { createProject, deleteProject, fetchProjects } from '@/services/projects'
import { formatDate } from '@/lib/utils'
import { useState } from 'react'

export function DashboardPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [newProjectName, setNewProjectName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => fetchProjects(user!.id),
    enabled: !!user,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createProject(user!.id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      setNewProjectName('')
      setDialogOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const stats = [
    { label: 'Projects', value: projects?.length ?? 0, icon: FolderOpen },
    { label: 'Layers', value: '—', icon: Layers },
    { label: 'AI Chats', value: '—', icon: MessageSquare },
    { label: 'Charts', value: '—', icon: BarChart3 },
  ]

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Manage your geospatial projects</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription>Give your project a name to get started.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="projectName">Project name</Label>
                <Input
                  id="projectName"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Sydney Population Analysis"
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMutation.mutate(newProjectName)}
                  disabled={!newProjectName.trim() || createMutation.isPending}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="glass-panel">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Recent projects</h2>
          {isLoading ? (
            <LoadingState message="Loading projects..." />
          ) : projects && projects.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Card key={project.id} className="group glass-panel transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Map className="h-5 w-5 text-primary" />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => deleteMutation.mutate(project.id)}
                      >
                        Delete
                      </Button>
                    </div>
                    <CardTitle className="text-base">
                      <Link to={`/project/${project.id}`} className="hover:text-primary">
                        {project.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>Updated {formatDate(project.updated_at)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link to={`/project/${project.id}`}>Open workspace</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No projects yet"
              description="Create your first project to start uploading and analysing geospatial data."
              actionLabel="Create project"
              onAction={() => setDialogOpen(true)}
            />
          )}
        </section>
      </div>
    </AppShell>
  )
}
