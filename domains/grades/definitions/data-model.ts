import { defineEntity, Types } from "@joi/domain";

export const studentType = defineEntity({
  name: "Student",
  description: "A person enrolled in classes during a school year.",
  attributes: [
    { name: "Name", description: "The student's full name.", type: Types.String },
    { name: "Date of Birth", description: "The student's date of birth.", type: Types.Date },
  ],
});

export const subjectType = defineEntity({
  name: "Subject",
  description: "A topic taught in one or more classes.",
  attributes: [{ name: "Name", description: "The subject's name.", type: Types.String }],
});

export const classType = defineEntity({
  name: "Class",
  description: "A group of students studying a set of subjects.",
  attributes: [
    { name: "Name", description: "The class's name.", type: Types.String },
    { name: "subjects", description: "Subjects taught in this class.", type: Types.set(Types.ref(subjectType)) },
    { name: "students", description: "Students enrolled in this class.", type: Types.set(Types.ref(studentType)) },
  ],
});

export const schoolYearType = defineEntity({
  name: "School Year",
  description: "An academic period containing classes.",
  attributes: [
    { name: "Name", description: "The school year's name.", type: Types.String },
    { name: "Timeframe", description: "The start and end dates of the school year.", type: Types.DateRange },
    { name: "Classes", description: "Classes offered during this school year.", type: Types.set(Types.ref(classType)) },
  ],
});
