package httpapi

import (
	"context"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

func (s *Server) registerAdminUsers() {
	api, repo := s.API, s.deps.AuthRepo

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-list-users", Method: "GET", Path: "/api/v1/admin/users", Summary: "List users"}, false),
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Users []auth.PublicUser `json:"users"`
			}
		}, error) {
			users, err := repo.ListUsers()
			if err != nil {
				return nil, err
			}
			out := &struct {
				Body struct {
					Users []auth.PublicUser `json:"users"`
				}
			}{}
			out.Body.Users = []auth.PublicUser{}
			for _, u := range users {
				out.Body.Users = append(out.Body.Users, auth.PublicUserOf(repo, u))
			}
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-create-user", Method: "POST", Path: "/api/v1/admin/users", Summary: "Create a user", DefaultStatus: 201}, true),
		func(ctx context.Context, in *struct {
			Body struct {
				Username string `json:"username"`
				Password string `json:"password"`
				Role     string `json:"role"`
				Email    string `json:"email,omitempty"`
				Name     string `json:"name,omitempty"`
			}
		}) (*struct {
			Body struct {
				User auth.PublicUser `json:"user"`
			}
		}, error) {
			if in.Body.Username == "" {
				return nil, huma.Error400BadRequest("username is required")
			}
			if len(in.Body.Password) < auth.MinPasswordLength {
				return nil, huma.Error400BadRequest("password too short")
			}
			role := db.UserRole(in.Body.Role)
			if !db.IsUserRole(in.Body.Role) {
				role = db.RoleUser
			}
			hash, err := auth.HashPassword(in.Body.Password)
			if err != nil {
				return nil, err
			}
			user, err := repo.CreateUser(db.NewUser{Username: in.Body.Username, Email: optStr(in.Body.Email), Name: optStr(in.Body.Name), PasswordHash: &hash, Role: role})
			if err != nil {
				if strings.Contains(err.Error(), "UNIQUE") {
					return nil, huma.Error409Conflict("that username is already taken")
				}
				return nil, err
			}
			out := &struct {
				Body struct {
					User auth.PublicUser `json:"user"`
				}
			}{}
			out.Body.User = auth.PublicUserOf(repo, user)
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-update-user", Method: "PATCH", Path: "/api/v1/admin/users/{id}", Summary: "Update a user's role or enabled state"}, true),
		func(ctx context.Context, in *struct {
			ID   int64 `path:"id"`
			Body struct {
				Role    *string `json:"role,omitempty"`
				Enabled *bool   `json:"enabled,omitempty"`
			}
		}) (*struct {
			Body struct {
				User auth.PublicUser `json:"user"`
			}
		}, error) {
			user, ok, err := repo.GetUserByID(in.ID)
			if err != nil || !ok {
				return nil, huma.Error404NotFound("user not found")
			}
			// Guard the last admin against demotion/disable.
			demoting := in.Body.Role != nil && *in.Body.Role != string(db.RoleAdmin)
			disabling := in.Body.Enabled != nil && !*in.Body.Enabled
			if user.Role == db.RoleAdmin && (demoting || disabling) {
				if n, _ := repo.AdminCount(); n <= 1 {
					return nil, huma.Error409Conflict("cannot demote or disable the last admin")
				}
			}
			if in.Body.Role != nil && db.IsUserRole(*in.Body.Role) {
				if err := repo.SetRole(in.ID, db.UserRole(*in.Body.Role)); err != nil {
					return nil, err
				}
			}
			if in.Body.Enabled != nil {
				if err := repo.SetEnabled(in.ID, *in.Body.Enabled); err != nil {
					return nil, err
				}
			}
			updated, _, _ := repo.GetUserByID(in.ID)
			out := &struct {
				Body struct {
					User auth.PublicUser `json:"user"`
				}
			}{}
			out.Body.User = auth.PublicUserOf(repo, updated)
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-reset-user-mfa", Method: "DELETE", Path: "/api/v1/admin/users/{id}/mfa", Summary: "Reset a user's MFA", DefaultStatus: 204}, true),
		func(ctx context.Context, in *struct {
			ID int64 `path:"id"`
		}) (*struct{}, error) {
			if _, ok, _ := repo.GetUserByID(in.ID); !ok {
				return nil, huma.Error404NotFound("user not found")
			}
			if err := repo.ResetMfa(in.ID); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-delete-user", Method: "DELETE", Path: "/api/v1/admin/users/{id}", Summary: "Delete a user", DefaultStatus: 204}, true),
		func(ctx context.Context, in *struct {
			ID int64 `path:"id"`
		}) (*struct{}, error) {
			user, ok, _ := repo.GetUserByID(in.ID)
			if !ok {
				return nil, huma.Error404NotFound("user not found")
			}
			if user.Role == db.RoleAdmin {
				if n, _ := repo.AdminCount(); n <= 1 {
					return nil, huma.Error409Conflict("cannot delete the last admin")
				}
			}
			if err := repo.DeleteUser(in.ID); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})
}
