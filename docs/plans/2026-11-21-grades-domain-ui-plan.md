# Grades Domain UI Plan

## Who defines the Grades layout?

The Grades UI plugin defines the navigation hierarchy, view scopes, list
columns, and detail content. JOI renders those contributions in its application
shell and shared master-detail layout. Grades uses the same plugin discovery
and route resolution as the other domains.

| Grades contributes | JOI renders |
| --- | --- |
| A Grades section through `navigationSection` | The persistent left sidebar and its tree |
| Route-to-view mappings through `viewResolvers` | The selected view, URL navigation, and back/forward behavior |
| Scoped list queries, columns, and editor definitions | The master list, detail pane, selection, and record editors |
| A grading detail component | The detail pane around the grading component |

Keep Grades labels, relationship filters, and grading behavior in the Grades
plugin. The shell resolves the registered views through the existing extension
points.

## How does the hierarchy determine the workspace?

```text
Grades
  Subjects
    Biology 101
      Assessments                  Subject assessment list | Grading sheet
      Section A
        Students                   Class roster            | Student and enrollment
      Section B
        Students                   Class roster            | Student and enrollment
  Student directory                Student list            | Student record
```

Build the tree from subject and class records using stable entity IDs.
Use folder nodes for the hierarchy and leaf nodes for views. Give each subject
a management view under its folder and each class a management view under its
class folder so both entities can be edited. Create subjects from the Subjects
view and create classes from their subject's management view.

The subject's Assessments view lists assessments across its classes and shows
each assessment's class. New assessments select a class within that subject.
The selected assessment's class determines who appears on the grading sheet.
A class's Students view lists enrollments for that class. Select an enrollment
to see the student's record and edit that enrollment. The shared student
directory lets users create and edit student records independently of class
membership.

## How does JOI render the master and detail panes?

Use `EntityMasterDetailView` for record-based lists and editors where its
existing behavior fits. Bind each list to its parent ID through the scoped
filter and view identity so switching subjects or classes updates the list and
clears selections from the previous scope. Keep the domain tree in the
application sidebar while the shell switches the view beside it.

The shared `MasterDetailView` currently renders `RecordEditor` for a selected
row. Add a narrow optional detail-rendering slot if needed for the assessment
grading sheet and the combined student and enrollment detail. The slot gets
the selected record and belongs to the view contribution. Its default
continues to render the standard editor. Grades supplies the grading sheet
with points, feedback, and explicit ungraded, missing, and excused states.
The assessment metadata editor remains available from that detail view.

## What does the Grades model need to supply?

Subjects own classes. Assessments belong to classes and are listed at subject
scope through that relationship. Enrollments connect students to classes.
A grade identifies an assessment and a student on its roster. The server
validates roster membership, prevents duplicate grades for the same student and
assessment, and bounds scored grades by the assessment's maximum points.
Grades provides these entities and operations through its backend plugin.

## How will the integration be verified?

Test plugin registration and route resolution through the application
registry. Exercise the shell with two subjects and multiple classes. Verify
that assessments stay within the selected subject, class student lists stay
within their roster, and the sidebar remains available while editing or grading.
Cover subject and class creation, enrollment, assessment creation, and grade
persistence through the relevant UI and server tests.
