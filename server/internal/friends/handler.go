package friends

import (
	"net/http"
	"strconv"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

type postBody struct {
	PostID string `json:"postId"`
	Body   string `json:"body"`
}

// postIDOf reads postId from the JSON body or, when there is no body (DELETE), from the query.
func postIDOf(w http.ResponseWriter, r *http.Request) (postBody, error) {
	var b postBody
	if r.ContentLength != 0 && r.Body != nil && r.Body != http.NoBody {
		if err := platform.Decode(w, r, &b); err != nil {
			return b, err
		}
	}
	if b.PostID == "" {
		b.PostID = r.URL.Query().Get("postId")
	}
	if b.PostID == "" {
		return b, platform.Invalid("postId", "필수예요")
	}
	return b, nil
}

// Register adds the friend routes (all need a login; anything of a non-friend is 404).
//
//	GET    /api/friends/code                → {code}
//	POST   /api/friends {code}              → Friend
//	GET    /api/friends                     → [Friend]
//	DELETE /api/friends/{id}                → 204
//	GET    /api/friends/feed?before=&limit= → {posts, nextCursor}
//	GET    /api/friends/{id}/day?date=      → Day
//	POST   /api/friends/cheers {postId}     → CheerState (DELETE: the same, cheer removed)
//	GET    /api/friends/comments?postId=    → [CommentView]
//	POST   /api/friends/comments {postId, body} → CommentView
//	DELETE /api/friends/comments/{id}       → 204
//	GET    /api/friends/photo?postId=       → image bytes
func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("GET /api/friends/code", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		code, err := svc.Code(uid)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, map[string]string{"code": code})
		return nil
	}))
	mux.HandleFunc("POST /api/friends", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		var in struct {
			Code string `json:"code"`
		}
		if err := platform.Decode(w, r, &in); err != nil {
			return err
		}
		f, err := svc.Add(uid, in.Code)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, f)
		return nil
	}))
	mux.HandleFunc("GET /api/friends", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		fs, err := svc.List(uid)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, fs)
		return nil
	}))
	mux.HandleFunc("DELETE /api/friends/{id}", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		if err := svc.Remove(uid, r.PathValue("id")); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
	mux.HandleFunc("GET /api/friends/feed", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		before, err := ParseCursor(r.URL.Query().Get("before"))
		if err != nil {
			return err
		}
		limit := 0
		if s := r.URL.Query().Get("limit"); s != "" {
			if limit, err = strconv.Atoi(s); err != nil || limit < 1 {
				return platform.Invalid("limit", "1 이상의 숫자여야 해요")
			}
		}
		feed, err := svc.Feed(uid, before, limit)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, feed)
		return nil
	}))
	mux.HandleFunc("GET /api/friends/{id}/day", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		day, err := svc.Day(uid, r.PathValue("id"), date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, day)
		return nil
	}))
	cheer := func(on bool) http.HandlerFunc {
		return platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
			b, err := postIDOf(w, r)
			if err != nil {
				return err
			}
			st, err := svc.SetCheer(uid, b.PostID, on)
			if err != nil {
				return err
			}
			platform.JSON(w, http.StatusOK, st)
			return nil
		})
	}
	mux.HandleFunc("POST /api/friends/cheers", cheer(true))
	mux.HandleFunc("DELETE /api/friends/cheers", cheer(false))
	mux.HandleFunc("GET /api/friends/comments", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		postID := r.URL.Query().Get("postId")
		if postID == "" {
			return platform.Invalid("postId", "필수예요")
		}
		cs, err := svc.Comments(uid, postID)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, cs)
		return nil
	}))
	mux.HandleFunc("POST /api/friends/comments", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		b, err := postIDOf(w, r)
		if err != nil {
			return err
		}
		c, err := svc.AddComment(uid, b.PostID, b.Body)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusCreated, c)
		return nil
	}))
	mux.HandleFunc("DELETE /api/friends/comments/{id}", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		if err := svc.DeleteComment(uid, r.PathValue("id")); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
	mux.HandleFunc("GET /api/friends/photo", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		postID := r.URL.Query().Get("postId")
		if postID == "" {
			return platform.Invalid("postId", "필수예요")
		}
		data, ct, err := svc.Photo(r.Context(), uid, postID)
		if err != nil {
			return err
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, no-store")
		_, _ = w.Write(data)
		return nil
	}))
}
