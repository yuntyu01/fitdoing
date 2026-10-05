// Package platform holds the shared plumbing: config, errors, HTTP helpers, dates and DB setup.
package platform

import (
	"errors"
	"net/http"
)

// Error is an API error rendered as {"code": ..., "message": ...}.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func BadRequest(code, msg string) *Error { return &Error{http.StatusBadRequest, code, msg} }
func Conflict(code, msg string) *Error   { return &Error{http.StatusConflict, code, msg} }
func NotFound(msg string) *Error         { return &Error{http.StatusNotFound, "NOT_FOUND", msg} }

// Invalid is a validation failure on one field.
func Invalid(field, msg string) *Error { return BadRequest("INVALID", field+": "+msg) }

// AsError converts any error into an *Error (unknown errors become 500).
func AsError(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return &Error{http.StatusInternalServerError, "INTERNAL", "서버 오류가 났어요"}
}
